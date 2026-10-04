/**
 * ============================================================
 * VTEC OS — Eventos para integrações de saída (server-only)
 * ============================================================
 * Quando algo acontece no CRM (lead novo, mensagem recebida), avisa os
 * destinos configurados pela empresa em Integrações:
 *   - webhook_custom: POST JSON assinado (X-Vtec-Signature) para a URL dela;
 *   - google_sheets:  POST para o Apps Script da planilha (só lead novo).
 * Nunca atrasa nem derruba o fluxo principal: roda em segundo plano e
 * grava o resultado da última entrega na própria configuração.
 * ============================================================
 */

import { createHmac } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { assertPublicHttpsUrl } from './safe-url';

export type IntegrationEvent = 'lead.created' | 'message.received' | 'test';

export const WEBHOOK_EVENTS: { key: Exclude<IntegrationEvent, 'test'>; label: string }[] = [
  { key: 'lead.created', label: 'Lead novo' },
  { key: 'message.received', label: 'Mensagem recebida no WhatsApp' },
];

export interface LeadEventData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  value: number;
  source: string;
  stage_id: string | null;
  created_at: string;
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  at: string;
  event: IntegrationEvent;
  error?: string;
  response?: string;
}

type Row = { provider: string; config: Record<string, unknown> | null };

export function signBody(secret: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function leadEventData(row: Record<string, unknown>, source: string): LeadEventData {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    phone: (row.phone as string) || null,
    email: (row.email as string) || null,
    value: Number(row.value) || 0,
    source,
    stage_id: (row.stage_id as string) || null,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

async function post(url: string, body: string, headers: Record<string, string>, acceptRedirect: boolean, event: IntegrationEvent): Promise<DeliveryResult> {
  const at = new Date().toISOString();
  try {
    await assertPublicHttpsUrl(url);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'vtec-os-webhooks/1.0', ...headers },
      body,
      // Sem seguir redirecionamento (evita desviar para rede interna).
      // O Apps Script responde 302 depois de já ter gravado a linha.
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const text = (await response.text().catch(() => '')).slice(0, 300);
    const ok = response.ok || (acceptRedirect && response.status >= 300 && response.status < 400);
    return { ok, status: response.status, at, event, response: text, ...(ok ? {} : { error: `A URL respondeu ${response.status}.` }) };
  } catch (error) {
    const message = error instanceof Error ? (error.name === 'TimeoutError' ? 'A URL demorou mais de 8 segundos para responder.' : error.message) : 'Falha ao enviar.';
    return { ok: false, status: null, at, event, error: message };
  }
}

export async function deliverWebhook(config: Record<string, unknown>, event: IntegrationEvent, data: unknown) {
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data });
  const secret = String(config.secret || '');
  return post(String(config.url || ''), body, {
    'X-Vtec-Event': event,
    ...(secret ? { 'X-Vtec-Signature': signBody(secret, body) } : {}),
  }, false, event);
}

export async function deliverSheets(config: Record<string, unknown>, event: IntegrationEvent, lead: LeadEventData) {
  return post(String(config.url || ''), JSON.stringify(lead), {}, true, event);
}

export async function recordDelivery(tenantId: string, provider: string, result: DeliveryResult) {
  const { data } = await supabaseAdmin.from('integrations_config').select('config').eq('tenant_id', tenantId).eq('provider', provider).maybeSingle();
  if (!data) return;
  await supabaseAdmin
    .from('integrations_config')
    .update({ config: { ...(data.config || {}), last_delivery: result } })
    .eq('tenant_id', tenantId)
    .eq('provider', provider);
}

async function dispatch(tenantId: string, event: IntegrationEvent, data: unknown) {
  const { data: rows } = await supabaseAdmin
    .from('integrations_config')
    .select('provider, config')
    .eq('tenant_id', tenantId)
    .in('provider', ['webhook_custom', 'google_sheets']);

  for (const row of (rows || []) as Row[]) {
    const config = row.config || {};
    if (!config.url || config.enabled === false) continue;

    if (row.provider === 'webhook_custom') {
      const events = Array.isArray(config.events) ? config.events : WEBHOOK_EVENTS.map((item) => item.key);
      if (!events.includes(event)) continue;
      await recordDelivery(tenantId, row.provider, await deliverWebhook(config, event, data));
    } else if (row.provider === 'google_sheets' && event === 'lead.created') {
      await recordDelivery(tenantId, row.provider, await deliverSheets(config, event, data as LeadEventData));
    }
  }
}

/** Dispara em segundo plano; erros só vão para o log. */
export function emitIntegrationEvent(tenantId: string, event: Exclude<IntegrationEvent, 'test'>, data: unknown) {
  dispatch(tenantId, event, data).catch((error) => console.error('[Integrações] Falha ao enviar evento', event, error));
}
