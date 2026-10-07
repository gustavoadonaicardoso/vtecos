/**
 * ============================================================
 * VTEC OS — Envio das campanhas (Disparos) em segundo plano
 * ============================================================
 * Ligado em src/instrumentation.ts (só em produção, com
 * CONTENT_SCHEDULER_ENABLED=true). A cada 5 segundos:
 *   1. campanhas agendadas que chegaram na hora começam;
 *   2. contatos presos em "enviando" (servidor reiniciou) viram falha --
 *      nunca reenviamos sozinhos para não mandar duas vezes;
 *   3. para cada empresa, a campanha mais antiga em envio manda UMA
 *      mensagem, se já passou o intervalo sorteado, se está dentro do
 *      horário de envio e abaixo do limite do dia.
 * WhatsApp desconectado pausa a campanha (o contato volta para a fila);
 * 5 falhas seguidas também pausam. Quem criou é avisado no sino.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { beat } from '@/lib/heartbeat';
import {
  contextFor,
  insideWindow,
  nextDayStart,
  nextWindowStart,
  renderForContact,
  startOfTodaySP,
  validWindow,
  type SendWindow,
} from '@/lib/disparos';
import { companyOf, syncCounts } from '@/services/disparos.service';
import { ChannelError, deliverWhatsApp, recordOutbound } from '@/lib/whatsapp-outbound';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TICK_MS = 5000;
const FAIL_STREAK_LIMIT = 5;
const STUCK_MS = 5 * 60_000;
const nowIso = () => new Date().toISOString();
const log = (...args: unknown[]) => console.error('[disparos]', ...args);
const timeLabel = (at: Date) => at.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function notifyOwner(campaign: Row, title: string, content: string) {
  if (!campaign.created_by) return;
  await db.from('system_notifications').insert({ user_id: campaign.created_by, type: 'campaign', title, content, is_read: false, link: `/disparos/${campaign.id}` });
}

const updateCampaign = (campaign: Row, changes: Row) =>
  db.from('blast_campaigns').update({ ...changes, updated_at: nowIso() }).eq('tenant_id', campaign.tenant_id).eq('id', campaign.id);

async function pause(campaign: Row, reason: string) {
  await updateCampaign(campaign, { status: 'paused', last_error: reason, status_detail: `Pausada automaticamente: ${reason}`, next_send_at: null });
  await notifyOwner(campaign, 'Campanha pausada', `"${campaign.name}" foi pausada: ${reason}`);
}

/** Lead do contato: o ligado, um com o mesmo número, ou um novo (se a campanha pede). */
async function leadFor(campaign: Row, contact: Row): Promise<Row | null> {
  if (contact.lead_id) {
    const { data } = await db.from('leads').select('*').eq('tenant_id', campaign.tenant_id).eq('id', contact.lead_id).maybeSingle();
    if (data) return data;
  }
  const suffix = String(contact.phone).slice(-8);
  const { data: candidates } = await db.from('leads').select('*').eq('tenant_id', campaign.tenant_id).ilike('phone', `%${suffix}`).limit(10);
  const match = ((candidates || []) as Row[]).find((lead) => String(lead.phone || '').replace(/\D/g, '').endsWith(suffix));
  if (match) return match;
  if (!campaign.create_leads) return null;
  const { data: stage } = await db.from('pipeline_stages').select('id').eq('tenant_id', campaign.tenant_id).order('position').limit(1).maybeSingle();
  const { data: created } = await db
    .from('leads')
    .insert({ tenant_id: campaign.tenant_id, name: contact.name || contact.phone, phone: contact.phone, stage_id: stage?.id ?? null, source: 'Disparos', tags: ['disparos'] })
    .select('*')
    .single();
  return created || null;
}

/** Manda a mensagem de um contato. ChannelError = problema do canal (não do contato). */
async function sendContact(campaign: Row, contact: Row, company: Awaited<ReturnType<typeof companyOf>>) {
  const lead = await leadFor(campaign, contact);
  const ctx = contextFor({ name: contact.name, phone: contact.phone, data: contact.data || {} }, lead, company);
  const channel = campaign.channel === 'api' ? 'api' : 'web';
  const rendered = renderForContact({ template: campaign.template || '', variants: campaign.variants || [], optoutText: campaign.optout_text || null, channel, metaTemplate: campaign.meta_template || null }, ctx);
  if (!rendered.text) throw new Error('Mensagem vazia depois de trocar as variáveis.');
  const payload = channel === 'api'
    ? { template: { name: campaign.meta_template.name, language: campaign.meta_template.language, params: rendered.params, preview: rendered.text } }
    : campaign.media_url
      ? { mediaUrl: campaign.media_url, mediaKind: campaign.media_kind || 'document', caption: rendered.text, fileName: campaign.media_name || undefined }
      : { text: rendered.text };
  const sent = await deliverWhatsApp(campaign.tenant_id, contact.phone, payload, channel);
  if (lead) await recordOutbound(campaign.tenant_id, String(lead.id), sent, payload, '📣', 'campaign').catch((error) => log('registro na conversa falhou', error));
  return { text: rendered.text, leadId: lead ? String(lead.id) : null };
}

async function finishIfDone(campaign: Row) {
  const { count: left } = await db.from('blast_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', campaign.tenant_id).eq('campaign_id', campaign.id).in('status', ['pending', 'sending']);
  if (left) return false;
  const counts = await syncCounts(campaign.tenant_id, campaign.id);
  await updateCampaign(campaign, { status: 'completed', finished_at: nowIso(), next_send_at: null, status_detail: null });
  await notifyOwner(campaign, 'Campanha concluída', `"${campaign.name}": ${counts.sent_count} enviada(s), ${counts.failed_count} com falha.`);
  return true;
}

/** Uma mensagem da campanha (se for a hora). */
async function step(campaign: Row, company: Awaited<ReturnType<typeof companyOf>>) {
  const now = new Date();
  const window: SendWindow | null = validWindow(campaign.send_window) ? campaign.send_window : null;

  if (!insideWindow(window, now)) {
    const next = nextWindowStart(window, now);
    await updateCampaign(campaign, { next_send_at: next.toISOString(), status_detail: `Fora do horário de envio. Volta ${timeLabel(next)}.` });
    return;
  }
  if (campaign.daily_limit) {
    const { count } = await db
      .from('blast_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', campaign.tenant_id)
      .eq('campaign_id', campaign.id)
      .in('status', ['sent', 'sending'])
      .gte('sent_at', startOfTodaySP(now).toISOString());
    if ((count || 0) >= campaign.daily_limit) {
      const next = nextDayStart(window, now);
      await updateCampaign(campaign, { next_send_at: next.toISOString(), status_detail: `Limite de ${campaign.daily_limit} por dia atingido. Volta ${timeLabel(next)}.` });
      return;
    }
  }

  // Próximo da fila, reivindicado (só um envio por contato).
  const { data: next } = await db.from('blast_contacts').select('id').eq('tenant_id', campaign.tenant_id).eq('campaign_id', campaign.id).eq('status', 'pending').order('position').limit(1);
  const nextId = next?.[0]?.id;
  if (!nextId) {
    await finishIfDone(campaign);
    return;
  }
  const { data: claimed } = await db
    .from('blast_contacts')
    .update({ status: 'sending', sending_at: nowIso(), sent_at: nowIso() })
    .eq('tenant_id', campaign.tenant_id)
    .eq('id', nextId)
    .eq('status', 'pending')
    .select('*');
  const contact = (claimed || [])[0] as Row | undefined;
  if (!contact) return;

  const delay = (Number(campaign.delay_min) + Math.random() * Math.max(0, Number(campaign.delay_max) - Number(campaign.delay_min))) * 1000;
  try {
    const result = await sendContact(campaign, contact, company);
    await db.from('blast_contacts').update({ status: 'sent', sent_at: nowIso(), error_msg: null, rendered_message: result.text.slice(0, 4000), lead_id: result.leadId }).eq('tenant_id', campaign.tenant_id).eq('id', contact.id);
    await updateCampaign(campaign, { fail_streak: 0, last_error: null, status_detail: null, next_send_at: new Date(Date.now() + delay).toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no envio.';
    if (error instanceof ChannelError) {
      // Não é culpa do contato: volta para a fila e a campanha pausa.
      await db.from('blast_contacts').update({ status: 'pending', sending_at: null, sent_at: null }).eq('tenant_id', campaign.tenant_id).eq('id', contact.id);
      await pause(campaign, message);
      return;
    }
    await db.from('blast_contacts').update({ status: 'failed', sent_at: null, error_msg: message.slice(0, 300) }).eq('tenant_id', campaign.tenant_id).eq('id', contact.id);
    const streak = (Number(campaign.fail_streak) || 0) + 1;
    if (streak >= FAIL_STREAK_LIMIT) {
      await updateCampaign(campaign, { fail_streak: streak });
      await pause(campaign, `${streak} falhas seguidas. Última: ${message}`);
    } else {
      await updateCampaign(campaign, { fail_streak: streak, last_error: message, next_send_at: new Date(Date.now() + delay).toISOString() });
    }
  }
  await syncCounts(campaign.tenant_id, campaign.id);
  await finishIfDone(campaign);
}

async function tick() {
  const now = nowIso();
  // 1. Agendadas que chegaram na hora.
  // tenant-scope: ok (o envio atende todas as empresas; cada campanha carrega o próprio tenant)
  await db.from('blast_campaigns').update({ status: 'running', started_at: now, next_send_at: now, status_detail: null, fail_streak: 0 }).eq('status', 'scheduled').lte('scheduled_at', now);

  // 2. Presos em "enviando" (servidor reiniciou no meio do envio).
  if (Date.now() - worker.lastStuckCheck > 60_000) {
    worker.lastStuckCheck = Date.now();
    // tenant-scope: ok (limpeza geral do envio)
    const { data: stuck } = await db
      .from('blast_contacts')
      .update({ status: 'failed', error_msg: 'Envio interrompido (o servidor reiniciou). Confira na conversa antes de reenviar.' })
      .eq('status', 'sending')
      .lt('sending_at', new Date(Date.now() - STUCK_MS).toISOString())
      .select('tenant_id, campaign_id');
    for (const key of new Set(((stuck || []) as Row[]).map((row) => `${row.tenant_id}|${row.campaign_id}`))) {
      const [tenantId, campaignId] = key.split('|');
      await syncCounts(tenantId, campaignId);
    }
  }

  // 3. Uma campanha por empresa: a mais antiga em envio.
  // tenant-scope: ok (o envio atende todas as empresas)
  const { data: running } = await db.from('blast_campaigns').select('*').eq('status', 'running').order('started_at').limit(200);
  const firstByTenant = new Map<string, Row>();
  for (const campaign of (running || []) as Row[]) if (!firstByTenant.has(campaign.tenant_id)) firstByTenant.set(campaign.tenant_id, campaign);

  for (const campaign of firstByTenant.values()) {
    if (campaign.next_send_at && new Date(campaign.next_send_at).getTime() > Date.now()) continue;
    try {
      await step(campaign, await companyOf(campaign.tenant_id));
    } catch (error) {
      log('erro na campanha', campaign.id, error);
    }
  }
}

type WorkerState = { timer: ReturnType<typeof setInterval> | null; running: boolean; lastStuckCheck: number };
const globalState = globalThis as typeof globalThis & { __vtecBlastWorker?: WorkerState };
const worker = globalState.__vtecBlastWorker ?? { timer: null, running: false, lastStuckCheck: 0 };
globalState.__vtecBlastWorker = worker;

export function startBlastWorker() {
  if (worker.timer) return;
  const run = async () => {
    if (worker.running) return;
    worker.running = true;
    try {
      await tick();
      beat('disparos');
    } catch (error) {
      log('erro no envio', error);
      beat('disparos', error);
    } finally {
      worker.running = false;
    }
  };
  worker.timer = setInterval(() => void run(), TICK_MS);
  console.log('[disparos] envio de campanhas iniciado (verifica a cada 5s)');
  void run();
}

/** Só para testes: roda um ciclo agora. */
export const runBlastTickForTests = () => tick();
