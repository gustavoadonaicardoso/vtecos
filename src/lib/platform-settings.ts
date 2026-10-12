/**
 * ============================================================
 * VTEC OS — Configurações da plataforma (server-only)
 * ============================================================
 * O que é da Vórtice e vale para todas as empresas: o app da Meta
 * (login com Facebook das Redes Sociais e do WhatsApp oficial), o token
 * do webhook do WhatsApp, a IA padrão, o Asaas e o e-mail (SMTP). Ficam no banco, editáveis no
 * Painel Master > Plataforma (integrations_config da empresa da
 * plataforma, provider "platform"). Campo vazio no painel cai para a
 * variável do .env (compatibilidade com quem já configurou por lá).
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

export interface PlatformSettings {
  metaAppId: string;
  metaAppSecret: string;
  /** Configuração do Login do Facebook para Empresas: Redes Sociais. */
  metaLoginConfigId: string;
  /** Configuração do cadastro incorporado: WhatsApp oficial. */
  metaWaConfigId: string;
  /** Token de verificação do webhook do WhatsApp no app da Meta. */
  whatsappVerifyToken: string;
  aiProvider: 'gemini' | 'ollama';
  geminiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  /** Cobrança automática: ambiente do Asaas (sandbox = teste). */
  asaasEnv: 'sandbox' | 'production';
  asaasApiKey: string;
  /** Token que o Asaas manda em cada aviso (webhook) -- confere que veio dele. */
  asaasWebhookToken: string;
  /** E-mail da Vórtice (SMTP): código de confirmação do cadastro. */
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  /** Remetente: "Vórtice Tecnologia <nao-responda@vorticetecnologia.com.br>". */
  smtpFrom: string;
}

export type PlatformKey = keyof PlatformSettings;

export const PLATFORM_FIELDS: { key: PlatformKey; env: string; secret: boolean; fallback?: string }[] = [
  { key: 'metaAppId', env: 'META_APP_ID', secret: false },
  { key: 'metaAppSecret', env: 'META_APP_SECRET', secret: true },
  { key: 'metaLoginConfigId', env: 'META_LOGIN_CONFIG_ID', secret: false },
  { key: 'metaWaConfigId', env: 'META_WA_CONFIG_ID', secret: false },
  { key: 'whatsappVerifyToken', env: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN', secret: false, fallback: 'vortice_verify_token_2024' },
  { key: 'aiProvider', env: 'AI_PROVIDER', secret: false, fallback: 'gemini' },
  { key: 'geminiKey', env: 'GEMINI_API_KEY', secret: true },
  { key: 'ollamaUrl', env: 'OLLAMA_URL', secret: false, fallback: 'http://127.0.0.1:11434' },
  { key: 'ollamaModel', env: 'OLLAMA_MODEL', secret: false, fallback: 'gemma3:4b' },
  { key: 'asaasEnv', env: 'ASAAS_ENV', secret: false, fallback: 'sandbox' },
  { key: 'asaasApiKey', env: 'ASAAS_API_KEY', secret: true },
  { key: 'asaasWebhookToken', env: 'ASAAS_WEBHOOK_TOKEN', secret: true },
  { key: 'smtpHost', env: 'SMTP_HOST', secret: false },
  { key: 'smtpPort', env: 'SMTP_PORT', secret: false, fallback: '587' },
  { key: 'smtpUser', env: 'SMTP_USER', secret: false },
  { key: 'smtpPassword', env: 'SMTP_PASSWORD', secret: true },
  { key: 'smtpFrom', env: 'SMTP_FROM', secret: false },
];

const PROVIDER = 'platform';
const TTL = 30_000;
type Stored = Partial<Record<PlatformKey, string>>;
let cache: { at: number; stored: Stored } | null = null;

async function platformTenantId(): Promise<string | null> {
  const { data } = await supabaseAdmin.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  return (data?.id as string) ?? null;
}

async function loadStored(): Promise<Stored> {
  if (cache && Date.now() - cache.at < TTL) return cache.stored;
  let stored: Stored = {};
  try {
    const tenantId = await platformTenantId();
    if (tenantId) {
      const { data } = await supabaseAdmin.from('integrations_config').select('config').eq('tenant_id', tenantId).eq('provider', PROVIDER).maybeSingle();
      stored = (data?.config || {}) as Stored;
    }
  } catch {
    // Sem banco: fica com o .env.
  }
  cache = { at: Date.now(), stored };
  return stored;
}

function merge(stored: Stored): PlatformSettings {
  const out = {} as Record<PlatformKey, string>;
  for (const field of PLATFORM_FIELDS) {
    out[field.key] = String(stored[field.key] || process.env[field.env] || field.fallback || '').trim();
  }
  return {
    ...out,
    aiProvider: out.aiProvider.toLowerCase() === 'ollama' ? 'ollama' : 'gemini',
    asaasEnv: out.asaasEnv.toLowerCase() === 'production' ? 'production' : 'sandbox',
  } as PlatformSettings;
}

/** Configurações em uso (painel primeiro, depois .env). */
export async function platformSettings(): Promise<PlatformSettings> {
  return merge(await loadStored());
}

/** Para a tela: de onde vem cada valor e quais segredos estão salvos (nunca o segredo em si). */
export async function platformSettingsView() {
  const stored = await loadStored();
  const fields = PLATFORM_FIELDS.map((field) => {
    const fromPanel = Boolean(stored[field.key]);
    const fromEnv = !fromPanel && Boolean(process.env[field.env]);
    const value = String(stored[field.key] || process.env[field.env] || '');
    return {
      key: field.key,
      env: field.env,
      secret: field.secret,
      source: fromPanel ? 'painel' : fromEnv ? 'env' : field.fallback ? 'padrão' : 'vazio',
      value: field.secret ? '' : value || field.fallback || '',
      hasValue: Boolean(value),
    };
  });
  return { fields };
}

/** Salva o que veio do painel. Segredo em branco mantém o atual; "clear" apaga e volta ao .env. */
export async function savePlatformSettings(input: Record<string, unknown>, clear: string[] = []): Promise<{ ok: true } | { error: string }> {
  const tenantId = await platformTenantId();
  if (!tenantId) return { error: 'Empresa da plataforma não encontrada.' };
  const current = { ...(await loadStored()) };
  for (const field of PLATFORM_FIELDS) {
    if (clear.includes(field.key)) {
      delete current[field.key];
      continue;
    }
    const raw = input[field.key];
    if (typeof raw !== 'string') continue;
    const value = raw.trim().slice(0, 500);
    if (field.secret && !value) continue;
    if (value) current[field.key] = value;
    else delete current[field.key];
  }
  if (current.aiProvider && !['gemini', 'ollama'].includes(current.aiProvider)) return { error: 'Escolha Gemini ou IA local.' };
  if (current.metaAppId && !/^\d{5,20}$/.test(current.metaAppId)) return { error: 'O ID do app da Meta tem só números.' };
  if (current.ollamaUrl && !/^https?:\/\/[^\s]+$/.test(current.ollamaUrl)) return { error: 'O endereço da IA local começa com http:// (ex.: http://127.0.0.1:11434).' };
  if (current.asaasEnv && !['sandbox', 'production'].includes(current.asaasEnv)) return { error: 'Escolha o ambiente do Asaas: teste (sandbox) ou produção.' };
  // A chave do Asaas diz de qual ambiente ela é ($aact_hmlg_ = teste, $aact_prod_ = produção).
  const env = current.asaasEnv || process.env.ASAAS_ENV || 'sandbox';
  if (current.asaasApiKey && /^\$aact_prod_/.test(current.asaasApiKey) && env !== 'production') return { error: 'Esta chave do Asaas é de produção: escolha o ambiente "Produção".' };
  if (current.asaasApiKey && /^\$aact_hmlg_/.test(current.asaasApiKey) && env === 'production') return { error: 'Esta chave do Asaas é de teste (sandbox): escolha o ambiente "Teste".' };
  if (current.asaasWebhookToken && current.asaasWebhookToken.length < 32) return { error: 'O token do webhook do Asaas precisa de pelo menos 32 caracteres (use o botão Gerar).' };
  if (current.smtpHost && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(current.smtpHost)) return { error: 'Servidor SMTP inválido (ex.: smtp.gmail.com).' };
  if (current.smtpPort && !/^\d{2,5}$/.test(current.smtpPort)) return { error: 'Porta SMTP inválida (geralmente 587 ou 465).' };
  if (current.smtpFrom && !/[^\s@<]+@[^\s@>]+\.[^\s@>]+/.test(current.smtpFrom)) return { error: 'Remetente inválido: use um e-mail, ex.: Vórtice <nao-responda@suaempresa.com.br>.' };

  const { error } = await supabaseAdmin.from('integrations_config').upsert(
    { tenant_id: tenantId, provider: PROVIDER, config: current, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,provider' }
  );
  if (error) return { error: error.message };
  cache = null;
  return { ok: true };
}

export const forgetPlatformSettings = () => { cache = null; };
