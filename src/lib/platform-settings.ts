/**
 * ============================================================
 * VTEC OS — Configurações da plataforma (server-only)
 * ============================================================
 * O que é da Vórtice e vale para todas as empresas: o app da Meta
 * (login com Facebook das Redes Sociais e do WhatsApp oficial), o token
 * do webhook do WhatsApp e a IA padrão. Ficam no banco, editáveis no
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
  return { ...out, aiProvider: out.aiProvider.toLowerCase() === 'ollama' ? 'ollama' : 'gemini' } as PlatformSettings;
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

  const { error } = await supabaseAdmin.from('integrations_config').upsert(
    { tenant_id: tenantId, provider: PROVIDER, config: current, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,provider' }
  );
  if (error) return { error: error.message };
  cache = null;
  return { ok: true };
}

export const forgetPlatformSettings = () => { cache = null; };
