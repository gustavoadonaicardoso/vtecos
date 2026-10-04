/**
 * ============================================================
 * VTEC OS — Integrações da empresa (server-only)
 * ============================================================
 * integrations_config guarda uma linha por empresa e provedor. Só o
 * servidor lê a tabela (migration 202610080001); a tela recebe os
 * segredos da Meta mascarados e, ao salvar, campo de segredo em branco
 * mantém o valor que já estava salvo.
 * ============================================================
 */

import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getWhatsAppWebStatus } from '@/lib/whatsapp-web';
import { assertPublicHttpsUrl } from '@/lib/integrations/safe-url';
import {
  deliverSheets,
  deliverWebhook,
  recordDelivery,
  WEBHOOK_EVENTS,
  type DeliveryResult,
} from '@/lib/integrations/events';
import type { ServiceResult } from '@/types';

export const PROVIDERS = ['whatsapp_meta', 'webhook_custom', 'google_sheets', 'lead_capture'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Campos que nunca voltam para o navegador. */
const SECRET_FIELDS: Partial<Record<Provider, string[]>> = {
  whatsapp_meta: ['token', 'appSecret'],
};

const LEGACY_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'vortice_verify_token_2024';

type Config = Record<string, unknown>;

export interface IntegrationView {
  provider: Provider;
  config: Config;
  /** Quais segredos já estão salvos (o valor em si não vai para a tela). */
  secrets: Record<string, boolean>;
  updated_at: string | null;
}

const random = (bytes: number) => randomBytes(bytes).toString('hex');
const str = (value: unknown, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

async function loadRow(tenantId: string, provider: Provider) {
  const { data } = await supabaseAdmin.from('integrations_config').select('config, updated_at').eq('tenant_id', tenantId).eq('provider', provider).maybeSingle();
  return data as { config: Config | null; updated_at: string | null } | null;
}

function maskConfig(provider: Provider, config: Config) {
  const secrets: Record<string, boolean> = {};
  const visible: Config = { ...config };
  for (const field of SECRET_FIELDS[provider] || []) {
    secrets[field] = Boolean(config[field]);
    delete visible[field];
  }
  if (provider === 'whatsapp_meta') {
    // Configurações antigas usam o token padrão (o mesmo que a Meta já tem cadastrado).
    visible.webhookVerifyToken = config.webhookVerifyToken || LEGACY_VERIFY_TOKEN;
  }
  return { visible, secrets };
}

export async function listIntegrations(tenantId: string): Promise<IntegrationView[]> {
  const { data } = await supabaseAdmin
    .from('integrations_config')
    .select('provider, config, updated_at')
    .eq('tenant_id', tenantId)
    .in('provider', PROVIDERS as unknown as string[]);

  return (data || []).map((row) => {
    const provider = row.provider as Provider;
    const { visible, secrets } = maskConfig(provider, (row.config || {}) as Config);
    return { provider, config: visible, secrets, updated_at: row.updated_at ?? null };
  });
}

/** Valida e junta com o que já está salvo. Devolve a configuração completa a gravar. */
async function buildConfig(provider: Provider, input: Config, existing: Config | null): Promise<{ config: Config } | { error: string }> {
  const current = existing || {};

  if (provider === 'whatsapp_meta') {
    const token = str(input.token, 1000) || str(current.token, 1000);
    const appSecret = str(input.appSecret, 200) || str(current.appSecret, 200);
    const phoneId = str(input.phoneId, 40).replace(/\D/g, '');
    const wabaId = str(input.wabaId, 40).replace(/\D/g, '');
    if (!token) return { error: 'Cole o token de acesso permanente.' };
    if (!phoneId) return { error: 'Informe o ID do número de telefone (só números).' };
    if (!wabaId) return { error: 'Informe o ID da conta do WhatsApp Business (só números).' };
    if (!appSecret) return { error: 'Cole a chave secreta do app: sem ela as mensagens recebidas são recusadas.' };
    // Configuração nova ganha um token de verificação só desta empresa;
    // as antigas continuam com o token que a Meta já tem cadastrado.
    const webhookVerifyToken = existing ? str(current.webhookVerifyToken, 100) || undefined : `vtec_${random(12)}`;
    return { config: { token, appSecret, phoneId, wabaId, ...(webhookVerifyToken ? { webhookVerifyToken } : {}) } };
  }

  if (provider === 'webhook_custom') {
    const url = str(input.url, 500);
    try {
      await assertPublicHttpsUrl(url);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'URL inválida.' };
    }
    const allowed = WEBHOOK_EVENTS.map((item) => item.key) as string[];
    const events = Array.isArray(input.events) ? input.events.filter((event): event is string => typeof event === 'string' && allowed.includes(event)) : allowed;
    if (events.length === 0) return { error: 'Escolha pelo menos um evento.' };
    const secret = str(input.secret, 200) || str(current.secret, 200) || random(24);
    return { config: { url, events, secret, enabled: input.enabled !== false, last_delivery: current.last_delivery } };
  }

  if (provider === 'google_sheets') {
    const url = str(input.url, 500);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(url)) {
      return { error: 'Cole a URL do app da Web do Apps Script (começa com https://script.google.com/macros/s/ e termina em /exec).' };
    }
    return { config: { url, enabled: input.enabled !== false, last_delivery: current.last_delivery } };
  }

  // lead_capture: a chave é sempre gerada aqui. "regenerate" troca a chave.
  const key = input.regenerate || !current.key ? `lc_${random(16)}` : String(current.key);
  return { config: { key, enabled: input.enabled !== false } };
}

export async function saveIntegration(tenantId: string, provider: Provider, input: Config): Promise<ServiceResult<IntegrationView>> {
  const existing = await loadRow(tenantId, provider);
  const built = await buildConfig(provider, input, existing?.config ?? null);
  if ('error' in built) return { success: false, error: built.error };

  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.from('integrations_config').upsert(
    { tenant_id: tenantId, provider, config: built.config, updated_at: updatedAt },
    { onConflict: 'tenant_id,provider' }
  );
  if (error) return { success: false, error: error.message };

  const { visible, secrets } = maskConfig(provider, built.config);
  return { success: true, data: { provider, config: visible, secrets, updated_at: updatedAt } };
}

export async function removeIntegration(tenantId: string, provider: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from('integrations_config').delete().eq('tenant_id', tenantId).eq('provider', provider);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Testes ───────────────────────────────────────────────────

export interface TestResult {
  ok: boolean;
  message: string;
  delivery?: DeliveryResult;
}

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v21.0'}`;

export async function testIntegration(tenantId: string, provider: Provider): Promise<TestResult> {
  const row = await loadRow(tenantId, provider);
  const config = row?.config;
  if (!config) return { ok: false, message: 'Salve a configuração antes de testar.' };

  if (provider === 'whatsapp_meta') {
    try {
      const response = await fetch(`${GRAPH}/${encodeURIComponent(String(config.phoneId))}?fields=display_phone_number,verified_name,quality_rating`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(10000),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = json?.error?.message || `A Meta respondeu ${response.status}.`;
        return { ok: false, message: `A Meta recusou: ${reason} Confira o token e o ID do número.` };
      }
      const quality = json.quality_rating ? ` · qualidade ${json.quality_rating}` : '';
      return { ok: true, message: `Conectado ao número ${json.display_phone_number || ''} (${json.verified_name || 'sem nome verificado'})${quality}.` };
    } catch {
      return { ok: false, message: 'Não foi possível falar com a Meta agora. Tente de novo em instantes.' };
    }
  }

  if (provider === 'webhook_custom') {
    const delivery = await deliverWebhook(config, 'test', { message: 'Teste do vtec os: se você recebeu isto, o webhook está funcionando.' });
    await recordDelivery(tenantId, provider, delivery);
    return delivery.ok
      ? { ok: true, message: `Sua URL recebeu o teste (resposta ${delivery.status}).`, delivery }
      : { ok: false, message: delivery.error || 'A URL não aceitou o teste.', delivery };
  }

  if (provider === 'google_sheets') {
    const delivery = await deliverSheets(config, 'test', {
      id: 'teste',
      name: 'Teste do vtec os',
      phone: '5511999999999',
      email: 'teste@exemplo.com',
      value: 0,
      source: 'teste',
      stage_id: null,
      created_at: new Date().toISOString(),
    });
    await recordDelivery(tenantId, provider, delivery);
    return delivery.ok
      ? { ok: true, message: 'Linha de teste enviada: confira a planilha.', delivery }
      : { ok: false, message: `${delivery.error || 'O Apps Script não aceitou o teste.'} Confira se a implantação está como "Qualquer pessoa".`, delivery };
  }

  return { ok: true, message: 'Nada a testar: use o formulário de exemplo para enviar um lead.' };
}

// ── Status geral da tela ─────────────────────────────────────

export interface PlatformService {
  key: string;
  label: string;
  description: string;
  configured: boolean;
  missing: string[];
}

function envStatus(key: string, label: string, description: string, vars: string[], extraCheck?: () => string | null): PlatformService {
  const missing = vars.filter((name) => !process.env[name]);
  const extra = extraCheck?.();
  if (extra) missing.push(extra);
  return { key, label, description, configured: missing.length === 0, missing };
}

export async function integrationsOverview(tenantId: string, options: { isPlatform: boolean; modules: string[] }) {
  const integrations = await listIntegrations(tenantId);

  const hasCrm = options.modules.includes('crm');
  const whatsappWeb = hasCrm ? getWhatsAppWebStatus(tenantId) : null;

  let socialAccounts: number | null = null;
  if (options.modules.includes('social')) {
    const { count } = await supabaseAdmin.from('social_accounts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active');
    socialAccounts = count ?? 0;
  }

  const platform = options.isPlatform
    ? [
        envStatus('twilio', 'Twilio (Discador)', 'Ligações pelo navegador no Discador e no card do lead.', ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID', 'TWILIO_PHONE_NUMBER']),
        envStatus('gemini', 'Google Gemini (IA)', 'Legendas com IA nas Redes Sociais e geração de notas fiscais.', ['GEMINI_API_KEY']),
        envStatus('meta-app', 'App da Meta (Redes Sociais)', 'Conectar Instagram/Facebook e publicar posts.', ['META_APP_ID', 'META_APP_SECRET']),
        envStatus('scheduler', 'Agendador de posts', 'Publica sozinho os posts agendados.', [], () => (process.env.CONTENT_SCHEDULER_ENABLED === 'true' ? null : 'CONTENT_SCHEDULER_ENABLED=true')),
      ]
    : null;

  return { integrations, whatsappWeb, socialAccounts, platform };
}
