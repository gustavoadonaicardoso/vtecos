/**
 * ============================================================
 * VTEC OS — Discador: conta Twilio de cada empresa (server-only)
 * ============================================================
 * Cada empresa conecta a própria conta Twilio em Integrações
 * (integrations_config, provider "twilio"): o sistema cria sozinho a
 * chave de API e o TwiML App, e guarda o número escolhido. As
 * ligações saem e são cobradas na conta dela.
 * As variáveis TWILIO_* do .env continuam valendo só para a empresa da
 * plataforma (Vórtice), enquanto ela não conectar pela tela.
 * ============================================================
 */

import twilio from 'twilio';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  phoneNumber: string;
}

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
export const voiceConnectUrl = () => `${appUrl()}/api/twilio/voice/connect`;
export const recordingStatusUrl = () => `${appUrl()}/api/twilio/voice/status`;

function complete(config: Partial<TwilioConfig> | null | undefined): TwilioConfig | null {
  if (!config) return null;
  const { accountSid, authToken, apiKeySid, apiKeySecret, twimlAppSid, phoneNumber } = config;
  if (!accountSid || !authToken || !apiKeySid || !apiKeySecret || !twimlAppSid || !phoneNumber) return null;
  return { accountSid, authToken, apiKeySid, apiKeySecret, twimlAppSid, phoneNumber };
}

function envConfig(): TwilioConfig | null {
  return complete({
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    apiKeySid: process.env.TWILIO_API_KEY,
    apiKeySecret: process.env.TWILIO_API_SECRET,
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  });
}

async function platformTenantId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  return (data?.id as string) ?? null;
}

/** Conta Twilio da empresa (ou null: o Discador não está conectado). */
export async function twilioConfigFor(tenantId: string): Promise<TwilioConfig | null> {
  const { data } = await supabaseAdmin.from('integrations_config').select('config').eq('tenant_id', tenantId).eq('provider', 'twilio').maybeSingle();
  const fromDb = complete(data?.config as Partial<TwilioConfig> | null);
  if (fromDb) return fromDb;
  const fromEnv = envConfig();
  if (fromEnv && tenantId === (await platformTenantId())) return fromEnv;
  return null;
}

/** Aviso do Twilio: de qual empresa é a conta que mandou. */
export async function tenantByAccountSid(accountSid: string): Promise<{ tenantId: string; config: TwilioConfig } | null> {
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) return null;
  // tenant-scope: ok (procura a empresa dona da conta Twilio; o resultado define o tenant)
  const { data } = await supabaseAdmin.from('integrations_config').select('tenant_id, config').eq('provider', 'twilio').eq('config->>accountSid', accountSid);
  for (const row of data || []) {
    const config = complete(row.config as Partial<TwilioConfig>);
    if (config) return { tenantId: String(row.tenant_id), config };
  }
  const fromEnv = envConfig();
  if (fromEnv && fromEnv.accountSid === accountSid) {
    const tenantId = await platformTenantId();
    if (tenantId) return { tenantId, config: fromEnv };
  }
  return null;
}

export const NOT_CONNECTED = 'O Discador não está conectado. Um administrador conecta a conta Twilio da empresa em Integrações.';

/** Token do navegador (Twilio Voice SDK) para o usuário ligar pela conta da empresa. */
export function voiceToken(config: TwilioConfig, identity: string) {
  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, { identity, ttl: 3600 });
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: config.twimlAppSid, incomingAllow: true }));
  return token.toJwt();
}

/** Ligação iniciada pelo servidor, com gravação. */
export function placeCall(config: TwilioConfig, to: string, twimlUrl: string) {
  return twilio(config.accountSid, config.authToken).calls.create({
    url: twimlUrl,
    to,
    from: config.phoneNumber,
    record: true,
    recordingStatusCallback: recordingStatusUrl(),
  });
}

/** Liga para um número, mostrando o número da empresa e gravando. */
export function dialNumberTwiml(to: string, callerId?: string) {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({ record: 'record-from-answer', recordingStatusCallback: recordingStatusUrl(), ...(callerId ? { callerId } : {}) });
  dial.number(to);
  return response.toString();
}

/** Conecta a ligação atendida a um usuário do sistema (navegador). */
export function dialAgentTwiml(agentIdentity: string) {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({ record: 'record-from-answer', recordingStatusCallback: recordingStatusUrl() });
  dial.client(agentIdentity);
  return response.toString();
}
