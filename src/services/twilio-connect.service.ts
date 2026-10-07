/**
 * ============================================================
 * VTEC OS — Conectar a conta Twilio da empresa (server-only)
 * ============================================================
 * O administrador cola só o Account SID e o Auth Token. O sistema
 * confere a conta, lista os números dela e, ao escolher um, cria na
 * conta da empresa a chave de API e o TwiML App do discador (apontando
 * para este servidor). Nada vai para o .env.
 * ============================================================
 */

import twilio from 'twilio';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { voiceConnectUrl, type TwilioConfig } from '@/lib/twilio-tenant';

const SID_RE = /^AC[0-9a-f]{32}$/i;
const TOKEN_RE = /^[0-9a-f]{32}$/i;
const APP_NAME = 'VTEC OS - Discador';

export interface TwilioNumber {
  phoneNumber: string;
  friendlyName: string;
  voice: boolean;
}

type Failure = { error: string };

function clean(accountSid: unknown, authToken: unknown): { accountSid: string; authToken: string } | Failure {
  const sid = String(accountSid || '').trim();
  const token = String(authToken || '').trim();
  if (!SID_RE.test(sid)) return { error: 'O Account SID começa com AC e tem 34 caracteres (está no painel do Twilio, em Account Info).' };
  if (!TOKEN_RE.test(token)) return { error: 'O Auth Token tem 32 caracteres (painel do Twilio, Account Info, botão de mostrar).' };
  return { accountSid: sid, authToken: token };
}

function friendly(error: unknown) {
  const code = (error as { code?: number; status?: number })?.code;
  const status = (error as { status?: number })?.status;
  if (code === 20003 || status === 401) return 'O Twilio recusou o Account SID ou o Auth Token. Confira e tente de novo.';
  if (code === 20404 || status === 404) return 'Conta não encontrada no Twilio.';
  return error instanceof Error ? `O Twilio respondeu: ${error.message}` : 'Não foi possível falar com o Twilio agora.';
}

/** Confere a conta e lista os números de telefone dela. */
export async function listTwilioNumbers(accountSid: unknown, authToken: unknown): Promise<{ numbers: TwilioNumber[]; accountName: string } | Failure> {
  const creds = clean(accountSid, authToken);
  if ('error' in creds) return creds;
  try {
    const client = twilio(creds.accountSid, creds.authToken);
    const account = await client.api.v2010.accounts(creds.accountSid).fetch();
    if (account.status !== 'active') return { error: `A conta Twilio está "${account.status}". Ative a conta para usar o discador.` };
    const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
    return {
      accountName: account.friendlyName || 'Conta Twilio',
      numbers: numbers.map((item) => ({ phoneNumber: item.phoneNumber, friendlyName: item.friendlyName || item.phoneNumber, voice: Boolean(item.capabilities?.voice) })),
    };
  } catch (error) {
    return { error: friendly(error) };
  }
}

async function currentConfig(tenantId: string) {
  const { data } = await supabaseAdmin.from('integrations_config').select('config').eq('tenant_id', tenantId).eq('provider', 'twilio').maybeSingle();
  return (data?.config || null) as (Partial<TwilioConfig> & { accountName?: string }) | null;
}

/** Cria (ou reaproveita) o TwiML App e uma chave de API nova, e salva tudo. */
export async function connectTwilio(tenantId: string, input: { accountSid: unknown; authToken: unknown; phoneNumber: unknown }): Promise<{ phoneNumber: string; accountName: string } | Failure> {
  const listed = await listTwilioNumbers(input.accountSid, input.authToken);
  if ('error' in listed) return listed;
  const creds = clean(input.accountSid, input.authToken) as { accountSid: string; authToken: string };
  const phoneNumber = String(input.phoneNumber || '');
  const chosen = listed.numbers.find((item) => item.phoneNumber === phoneNumber);
  if (!chosen) return { error: 'Escolha um dos números da conta.' };
  if (!chosen.voice) return { error: 'Esse número não faz ligações de voz. Escolha outro ou compre um número com voz no Twilio.' };

  const client = twilio(creds.accountSid, creds.authToken);
  const previous = await currentConfig(tenantId);
  const sameAccount = previous?.accountSid === creds.accountSid;
  try {
    // TwiML App: o discador do navegador liga por ele.
    let twimlAppSid = sameAccount ? previous?.twimlAppSid : undefined;
    if (twimlAppSid) {
      await client.applications(twimlAppSid).update({ voiceUrl: voiceConnectUrl(), voiceMethod: 'POST' }).catch(() => { twimlAppSid = undefined; });
    }
    if (!twimlAppSid) {
      const app = await client.applications.create({ friendlyName: APP_NAME, voiceUrl: voiceConnectUrl(), voiceMethod: 'POST' });
      twimlAppSid = app.sid;
    }

    // Chave de API nova a cada conexão (o segredo só aparece na criação).
    const key = await client.newKeys.create({ friendlyName: `${APP_NAME} (${new Date().toISOString().slice(0, 10)})` });
    if (sameAccount && previous?.apiKeySid && previous.apiKeySid !== key.sid) await client.keys(previous.apiKeySid).remove().catch(() => undefined);

    const config: TwilioConfig & { accountName: string; connectedAt: string } = {
      accountSid: creds.accountSid,
      authToken: creds.authToken,
      apiKeySid: key.sid,
      apiKeySecret: key.secret,
      twimlAppSid,
      phoneNumber: chosen.phoneNumber,
      accountName: listed.accountName,
      connectedAt: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from('integrations_config').upsert(
      { tenant_id: tenantId, provider: 'twilio', config, updated_at: config.connectedAt },
      { onConflict: 'tenant_id,provider' }
    );
    if (error) return { error: error.message };
    return { phoneNumber: chosen.phoneNumber, accountName: listed.accountName };
  } catch (error) {
    return { error: friendly(error) };
  }
}

/** Remove a chave e o TwiML App criados (se der) e apaga a conexão. */
export async function disconnectTwilio(tenantId: string): Promise<{ ok: true } | Failure> {
  const config = await currentConfig(tenantId);
  if (config?.accountSid && config.authToken) {
    const client = twilio(config.accountSid, config.authToken);
    if (config.apiKeySid) await client.keys(config.apiKeySid).remove().catch(() => undefined);
    if (config.twimlAppSid) await client.applications(config.twimlAppSid).remove().catch(() => undefined);
  }
  const { error } = await supabaseAdmin.from('integrations_config').delete().eq('tenant_id', tenantId).eq('provider', 'twilio');
  return error ? { error: error.message } : { ok: true };
}
