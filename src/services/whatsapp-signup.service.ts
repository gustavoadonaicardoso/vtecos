/**
 * ============================================================
 * VTEC OS — WhatsApp oficial: "Conectar com Facebook" (server-only)
 * ============================================================
 * Cadastro incorporado da Meta (Embedded Signup): o administrador da
 * empresa entra com o Facebook, escolhe (ou cria) a conta do WhatsApp
 * Business e o número. O navegador devolve um código e os IDs; aqui:
 *   1. o código vira um token da empresa (app da Vórtice);
 *   2. o app da Vórtice é inscrito na conta (webhook de mensagens);
 *   3. o número é registrado na Cloud API;
 *   4. tudo é salvo em integrations_config (whatsapp_meta, source
 *      "embedded"). As mensagens chegam assinadas com o segredo do app
 *      da Vórtice (META_APP_SECRET), então nada vai para o .env da
 *      empresa.
 * Precisa (uma vez, da Vórtice, no Painel Master > Plataforma): ID e
 * segredo do app da Meta e o ID da configuração de cadastro incorporado.
 * ============================================================
 */

import { randomInt } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { platformSettings } from '@/lib/platform-settings';

const graphVersion = () => process.env.META_GRAPH_VERSION || 'v23.0';
const graph = (path: string) => `https://graph.facebook.com/${graphVersion()}/${path}`;

export async function embeddedSignupReady() {
  const settings = await platformSettings();
  return Boolean(settings.metaAppId && settings.metaAppSecret && settings.metaWaConfigId);
}

/** O que o navegador precisa para abrir o login (nada secreto). */
export async function signupClientConfig() {
  const settings = await platformSettings();
  return settings.metaAppId && settings.metaAppSecret && settings.metaWaConfigId
    ? { appId: settings.metaAppId, configId: settings.metaWaConfigId, graphVersion: graphVersion() }
    : null;
}

type Failure = { error: string };

async function graphCall(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.error) {
    const error = (json.error || {}) as { message?: string; error_user_msg?: string };
    throw new Error(error.error_user_msg || error.message || `A Meta respondeu ${response.status}.`);
  }
  return json;
}

const digits = (value: unknown) => String(value || '').replace(/\D/g, '').slice(0, 30);

export async function completeEmbeddedSignup(
  tenantId: string,
  input: { code: unknown; phoneNumberId: unknown; wabaId: unknown }
): Promise<{ displayPhone: string; verifiedName: string; warning?: string } | Failure> {
  const settings = await platformSettings();
  if (!(await embeddedSignupReady())) return { error: 'O login do WhatsApp ainda não foi configurado pela Vórtice. Use o formulário manual por enquanto.' };
  const code = String(input.code || '').trim();
  const phoneNumberId = digits(input.phoneNumberId);
  const wabaId = digits(input.wabaId);
  if (!code) return { error: 'O Facebook não devolveu a autorização. Tente de novo.' };
  if (!phoneNumberId || !wabaId) return { error: 'Escolha a conta e o número do WhatsApp até o fim do cadastro.' };

  // Mesmo número já conectado em outra empresa?
  // tenant-scope: ok (confere se o número pertence a outra empresa antes de conectar)
  const { data: owners } = await supabaseAdmin.from('integrations_config').select('tenant_id').eq('provider', 'whatsapp_meta').eq('config->>phoneId', phoneNumberId);
  if ((owners || []).some((row) => row.tenant_id !== tenantId)) return { error: 'Este número já está conectado em outra empresa do sistema.' };

  let token: string;
  try {
    const params = new URLSearchParams({ client_id: settings.metaAppId, client_secret: settings.metaAppSecret, code });
    const exchanged = await graphCall(`${graph('oauth/access_token')}?${params}`);
    token = String(exchanged.access_token || '');
    if (!token) return { error: 'A Meta não devolveu o token. Tente conectar de novo.' };
  } catch (error) {
    return { error: `Não foi possível concluir o login: ${error instanceof Error ? error.message : 'erro na Meta'}` };
  }

  const auth = { Authorization: `Bearer ${token}` };
  let displayPhone = '';
  let verifiedName = '';
  try {
    const phone = await graphCall(`${graph(phoneNumberId)}?fields=display_phone_number,verified_name`, { headers: auth });
    displayPhone = String(phone.display_phone_number || '');
    verifiedName = String(phone.verified_name || '');
    // Mensagens desta conta passam a chegar no webhook do app da Vórtice.
    await graphCall(graph(`${wabaId}/subscribed_apps`), { method: 'POST', headers: auth });
  } catch (error) {
    return { error: `A Meta recusou a conexão do número: ${error instanceof Error ? error.message : 'erro'}` };
  }

  // Registro na Cloud API (número novo). Número que já usava a API pode
  // já estar registrado com outro PIN: segue, só avisa.
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
  let warning: string | undefined;
  try {
    await graphCall(graph(`${phoneNumberId}/register`), {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    });
  } catch (error) {
    warning = `O número foi conectado, mas a Meta não aceitou o registro automático (${error instanceof Error ? error.message : 'erro'}). Se ele já usava a API, tudo certo; senão, confira a verificação em duas etapas no Gerenciador do WhatsApp.`;
  }

  const config = {
    token,
    phoneId: phoneNumberId,
    wabaId,
    source: 'embedded',
    displayPhone,
    verifiedName,
    pin,
    connectedAt: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from('integrations_config').upsert(
    { tenant_id: tenantId, provider: 'whatsapp_meta', config, updated_at: config.connectedAt },
    { onConflict: 'tenant_id,provider' }
  );
  if (error) return { error: error.message };
  return { displayPhone, verifiedName, warning };
}
