/**
 * ============================================================
 * VTEC OS — Disparos (campanhas de WhatsApp) — server-only
 * ============================================================
 * Cria campanhas a partir de uma planilha ou de leads do CRM, controla
 * a situação (iniciar, agendar, pausar, cancelar, reenviar falhas) e
 * trata as respostas dos contatos (roteamento, etiqueta, automação e
 * pedido para sair). O envio em si é feito em segundo plano por
 * src/lib/disparos/worker.ts -- nada depende do navegador ficar aberto.
 * Tudo recebe o tenantId da sessão.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { permissionEnabled } from '@/lib/permissions.constants';
import type { RunContext } from '@/lib/automations/flow';
import {
  columnVariable,
  contextFor,
  DEFAULT_WINDOW,
  isOptOut,
  normalizePhone,
  phoneSuffix,
  renderForContact,
  startOfTodaySP,
  validWindow,
  type CampaignContact,
  type CampaignCounts,
  type CampaignDetail,
  type CampaignStatus,
  type CampaignSummary,
  type Channel,
  type ColumnConfig,
  type CrmAudience,
  type MetaTemplateChoice,
  type SendWindow,
} from '@/lib/disparos';
import type { UserProfile } from '@/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Failure = { error: string; status: number };
type Actor = Pick<UserProfile, 'id' | 'name' | 'role' | 'permissions'>;

const MAX_RECIPIENTS = 20000;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const nowIso = () => new Date().toISOString();
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Quem pode criar e controlar campanhas: admin, gerente ou quem tem "Chat interno e Disparos". */
export function canUseCampaigns(profile: Actor) {
  return profile.role === 'ADMIN' || profile.role === 'MANAGER' || permissionEnabled(profile.permissions, 'messages.send');
}

const missingTable = (message?: string) => Boolean(message && /blast_|whatsapp_optouts|schema cache|does not exist|column/i.test(message));
const MIGRATION_HINT = 'Rode a migration 202610180001_disparos_v2.sql no Supabase para usar os Disparos.';

// ── Leitura ─────────────────────────────────────────────────

const countsOf = (row: Row): CampaignCounts => ({
  total: Number(row.total_contacts) || 0,
  pending: Number(row.pending_count) || 0,
  sent: Number(row.sent_count) || 0,
  failed: Number(row.failed_count) || 0,
  skipped: Number(row.skipped_count) || 0,
  replied: Number(row.replied_count) || 0,
  optouts: Number(row.optout_count) || 0,
});

function toSummary(row: Row): CampaignSummary {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    channel: row.channel === 'api' ? 'api' : 'web',
    template: row.template || '',
    created_at: row.created_at,
    scheduled_at: row.scheduled_at || null,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
    next_send_at: row.next_send_at || null,
    status_detail: row.status_detail || null,
    last_error: row.last_error || null,
    delay_min: Number(row.delay_min) || 10,
    delay_max: Number(row.delay_max) || 25,
    send_window: validWindow(row.send_window) ? row.send_window : null,
    daily_limit: row.daily_limit ? Number(row.daily_limit) : null,
    counts: countsOf(row),
  };
}

export async function listCampaigns(tenantId: string): Promise<CampaignSummary[] | Failure> {
  const { data, error } = await db.from('blast_campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200);
  if (error) return { error: missingTable(error.message) ? MIGRATION_HINT : error.message, status: 500 };
  const rows = (data || []) as Row[];
  // Uma campanha por vez por empresa: as outras "Enviando" esperam a vez.
  const firstRunning = rows.filter((row) => row.status === 'running').sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))[0];
  return rows.map((row) => {
    const summary = toSummary(row);
    if (row.status === 'running' && firstRunning && row.id !== firstRunning.id) summary.status_detail = `Na fila: espera "${firstRunning.name}" terminar.`;
    return summary;
  });
}

export type ContactFilter = 'all' | 'pending' | 'sent' | 'failed' | 'skipped' | 'replied';

export async function getCampaign(tenantId: string, id: string, options: { filter?: ContactFilter; q?: string; page?: number } = {}): Promise<{ campaign: CampaignDetail; contacts: CampaignContact[]; total: number } | Failure> {
  const { data: row } = await db.from('blast_campaigns').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!row) return { error: 'Campanha não encontrada.', status: 404 };

  const page = Math.max(0, Number(options.page) || 0);
  let query = db
    .from('blast_contacts')
    .select('id, phone, name, lead_id, status, error_msg, rendered_message, sent_at, replied_at, reply_text', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('campaign_id', id);
  if (options.filter === 'replied') query = query.not('replied_at', 'is', null);
  else if (options.filter === 'pending') query = query.in('status', ['pending', 'sending']);
  else if (options.filter && options.filter !== 'all') query = query.eq('status', options.filter);
  const q = text(options.q, 60).replace(/[,()*%\\]/g, ' ');
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q.replace(/\D/g, '') || q}%`);
  const { data: contacts, count } = await query.order('position').range(page * 50, page * 50 + 49);

  const { count: sentToday } = await db
    .from('blast_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('campaign_id', id)
    .eq('status', 'sent')
    .gte('sent_at', startOfTodaySP(new Date()).toISOString());

  const summary = toSummary(row);
  if (row.status === 'running') {
    const { data: earlier } = await db.from('blast_campaigns').select('name').eq('tenant_id', tenantId).eq('status', 'running').lt('started_at', row.started_at || nowIso()).order('started_at').limit(1);
    if (earlier?.[0]) summary.status_detail = `Na fila: espera "${earlier[0].name}" terminar.`;
  }

  return {
    campaign: {
      ...summary,
      variants: Array.isArray(row.variants) ? row.variants : [],
      meta_template: row.meta_template || null,
      media_url: row.media_url || null,
      media_kind: row.media_kind || null,
      media_name: row.media_name || null,
      optout_text: row.optout_text ?? null,
      audience: row.audience || {},
      columns_config: Array.isArray(row.columns_config) ? row.columns_config : [],
      create_leads: Boolean(row.create_leads),
      route_type: ['user', 'stage'].includes(row.route_type) ? row.route_type : 'none',
      route_to_id: row.route_to_id || null,
      route_to_label: row.route_to_label || null,
      tag_on_reply: row.tag_on_reply || null,
      flow_on_reply: row.flow_on_reply || null,
      sent_today: sentToday || 0,
    },
    contacts: (contacts || []) as CampaignContact[],
    total: count || 0,
  };
}

/** Recalcula os contadores da campanha a partir dos contatos. */
export async function syncCounts(tenantId: string, campaignId: string) {
  const count = async (apply: (query: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { count: value } = await apply(db.from('blast_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('campaign_id', campaignId));
    return value || 0;
  };
  const [pending, sent, failed, skipped, canceled, replied] = await Promise.all([
    count((q) => q.in('status', ['pending', 'sending'])),
    count((q) => q.eq('status', 'sent')),
    count((q) => q.eq('status', 'failed')),
    count((q) => q.eq('status', 'skipped')),
    count((q) => q.eq('status', 'canceled')),
    count((q) => q.not('replied_at', 'is', null)),
  ]);
  const counts = { pending_count: pending, sent_count: sent, failed_count: failed, skipped_count: skipped, replied_count: replied, total_contacts: pending + sent + failed + skipped + canceled };
  await db.from('blast_campaigns').update({ ...counts, updated_at: nowIso() }).eq('tenant_id', tenantId).eq('id', campaignId);
  return counts;
}

// ── Criar ───────────────────────────────────────────────────

interface Recipient {
  phone: string;
  name: string;
  lead_id: string | null;
  data: Record<string, string>;
}

export interface CreateInput {
  name?: unknown;
  action?: unknown;
  scheduledAt?: unknown;
  audience?: { type?: unknown; rows?: unknown; columns?: unknown; fileName?: unknown } & Partial<CrmAudience>;
  template?: unknown;
  variants?: unknown;
  channel?: unknown;
  metaTemplate?: unknown;
  media?: { url?: unknown; kind?: unknown; name?: unknown } | null;
  optoutText?: unknown;
  delayMin?: unknown;
  delayMax?: unknown;
  sendWindow?: unknown;
  dailyLimit?: unknown;
  createLeads?: unknown;
  routeType?: unknown;
  routeToId?: unknown;
  tagOnReply?: unknown;
  flowOnReply?: unknown;
}

const stringArray = (value: unknown, max = 100) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, max) : []);

/** Leads do CRM que entram na campanha (filtros combinados com E). */
async function crmRecipients(tenantId: string, audience: CrmAudience): Promise<Recipient[]> {
  let query = db.from('leads').select('id, name, phone, email, tags, stage_id, value').eq('tenant_id', tenantId).eq('blocked', false).not('phone', 'is', null);
  const stages = stringArray(audience.stageIds);
  const tags = stringArray(audience.tags);
  const owners = stringArray(audience.assignedTo).filter((id) => UUID_RE.test(id));
  if (stages.length) query = query.in('stage_id', stages);
  if (tags.length) query = query.overlaps('tags', tags);
  if (owners.length) query = query.in('assigned_to', owners);
  const days = Number(audience.createdWithinDays);
  if (days > 0) query = query.gte('created_at', new Date(Date.now() - days * 86400_000).toISOString());
  const { data } = await query.order('created_at').limit(MAX_RECIPIENTS);
  return ((data || []) as Row[]).map((lead) => ({
    phone: String(lead.phone || ''),
    name: String(lead.name || ''),
    lead_id: String(lead.id),
    data: { nome: String(lead.name || ''), telefone: String(lead.phone || ''), email: String(lead.email || '') },
  }));
}

export async function previewAudience(tenantId: string, audience: CrmAudience) {
  const recipients = await crmRecipients(tenantId, audience);
  const optouts = await optoutSuffixes(tenantId);
  const seen = new Set<string>();
  let valid = 0;
  let invalid = 0;
  let optout = 0;
  let duplicate = 0;
  for (const item of recipients) {
    const phone = normalizePhone(item.phone);
    if (!phone) { invalid += 1; continue; }
    const suffix = phoneSuffix(phone);
    if (optouts.has(suffix)) { optout += 1; continue; }
    if (seen.has(suffix)) { duplicate += 1; continue; }
    seen.add(suffix);
    valid += 1;
  }
  return { total: recipients.length, valid, invalid, optout, duplicate, sample: recipients.slice(0, 3).map((item) => ({ name: item.name, phone: item.phone, data: item.data })), limited: recipients.length >= MAX_RECIPIENTS };
}

async function optoutSuffixes(tenantId: string) {
  const { data } = await db.from('whatsapp_optouts').select('phone').eq('tenant_id', tenantId).limit(50000);
  return new Set(((data || []) as Row[]).map((row) => phoneSuffix(String(row.phone))));
}

function parseWindow(value: unknown): SendWindow | null | 'invalid' {
  if (value === null) return null;
  if (value === undefined) return DEFAULT_WINDOW;
  const raw = (value && typeof value === 'object' ? value : {}) as Row;
  const window = { start: text(raw.start, 5), end: text(raw.end, 5), days: (Array.isArray(raw.days) ? raw.days : []).map(Number).filter((day: number) => day >= 0 && day <= 6) };
  return validWindow(window) ? { ...window, days: [...new Set(window.days)].sort() } : 'invalid';
}

function parseMetaTemplate(value: unknown): MetaTemplateChoice | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Row;
  const name = text(raw.name, 120);
  const body = text(raw.body, 2000);
  if (!name || !body) return null;
  return { name, language: text(raw.language, 12) || 'pt_BR', body, params: stringArray(raw.params, 20).map((param) => param.slice(0, 500)) };
}

/** Lê e confere tudo o que veio da tela (menos o público). */
async function campaignFields(tenantId: string, input: CreateInput): Promise<Row | Failure> {
  const name = text(input.name, 80);
  if (!name) return { error: 'Dê um nome para a campanha.', status: 400 };
  const channel: Channel = input.channel === 'api' ? 'api' : 'web';
  const template = text(input.template, 4000);
  const metaTemplate = parseMetaTemplate(input.metaTemplate);
  if (channel === 'api' && !metaTemplate) return { error: 'Pela API oficial, campanhas precisam de um template aprovado pela Meta.', status: 400 };
  if (channel === 'web' && !template) return { error: 'Escreva a mensagem.', status: 400 };

  const delayMin = Math.round(Number(input.delayMin));
  const delayMax = Math.round(Number(input.delayMax));
  if (!(delayMin >= 2 && delayMax >= delayMin && delayMax <= 600)) return { error: 'Intervalo entre mensagens inválido (de 2 a 600 segundos, o mínimo menor que o máximo).', status: 400 };
  const window = parseWindow(input.sendWindow);
  if (window === 'invalid') return { error: 'Horário de envio inválido: escolha os dias e um fim depois do início.', status: 400 };
  const dailyLimit = input.dailyLimit === null || input.dailyLimit === undefined || input.dailyLimit === '' ? null : Math.round(Number(input.dailyLimit));
  if (dailyLimit !== null && !(dailyLimit >= 1 && dailyLimit <= 10000)) return { error: 'Limite por dia inválido (1 a 10.000).', status: 400 };

  let media: { url: string; kind: string; name: string } | null = null;
  if (input.media && typeof input.media === 'object' && input.media.url) {
    const url = text(input.media.url, 1000);
    if (!/^https:\/\/\S+$/i.test(url)) return { error: 'Anexo inválido.', status: 400 };
    if (channel === 'api') return { error: 'Na API oficial o conteúdo vem do template: tire o anexo.', status: 400 };
    media = { url, kind: ['image', 'video', 'document'].includes(String(input.media.kind)) ? String(input.media.kind) : 'document', name: text(input.media.name, 120) };
  }

  const routeType = ['user', 'stage'].includes(String(input.routeType)) ? String(input.routeType) : 'none';
  let routeToId: string | null = null;
  let routeToLabel: string | null = null;
  if (routeType === 'user') {
    const { data } = await db.from('profiles').select('id, name').eq('tenant_id', tenantId).eq('id', text(input.routeToId, 60)).eq('status', 'ACTIVE').maybeSingle();
    if (!data) return { error: 'Escolha alguém ativo da equipe para receber as respostas.', status: 400 };
    routeToId = data.id;
    routeToLabel = data.name;
  } else if (routeType === 'stage') {
    const { data } = await db.from('pipeline_stages').select('id, name').eq('tenant_id', tenantId).eq('id', text(input.routeToId, 80)).maybeSingle();
    if (!data) return { error: 'Escolha a etapa do funil para quem responder.', status: 400 };
    routeToId = data.id;
    routeToLabel = data.name;
  }
  let flowOnReply: string | null = null;
  if (input.flowOnReply) {
    const { data } = await db.from('automation_flows').select('id').eq('tenant_id', tenantId).eq('id', text(input.flowOnReply, 60)).maybeSingle();
    if (!data) return { error: 'A automação escolhida não existe mais.', status: 400 };
    flowOnReply = data.id;
  }

  return {
    name,
    channel,
    template: channel === 'api' ? metaTemplate!.body : template,
    variants: channel === 'web' ? stringArray(input.variants, 4).map((item) => item.slice(0, 4000)).filter((item) => item.trim()) : [],
    meta_template: channel === 'api' ? metaTemplate : null,
    media_url: media?.url || null,
    media_kind: media?.kind || null,
    media_name: media?.name || null,
    optout_text: channel === 'web' && input.optoutText !== null ? text(input.optoutText, 200) || null : null,
    delay_min: delayMin,
    delay_max: delayMax,
    send_window: window,
    daily_limit: dailyLimit,
    create_leads: input.createLeads === true,
    route_type: routeType,
    route_to_id: routeToId,
    route_to_label: routeToLabel,
    tag_on_reply: text(input.tagOnReply, 40) || null,
    flow_on_reply: flowOnReply,
  };
}

/** Grava a campanha e os contatos (com os pulados já marcados). */
async function insertCampaign(tenantId: string, actor: Actor, fields: Row, recipients: Recipient[], start: { status: CampaignStatus; scheduledAt?: string | null }): Promise<{ id: string } | Failure> {
  const optouts = await optoutSuffixes(tenantId);
  const seen = new Set<string>();
  const contacts = recipients.slice(0, MAX_RECIPIENTS).map((item, index) => {
    const phone = normalizePhone(item.phone);
    const suffix = phone ? phoneSuffix(phone) : '';
    let status = 'pending';
    let error: string | null = null;
    if (!phone) { status = 'skipped'; error = 'Telefone inválido.'; }
    else if (optouts.has(suffix)) { status = 'skipped'; error = 'Pediu para não receber campanhas.'; }
    else if (seen.has(suffix)) { status = 'skipped'; error = 'Número repetido na lista.'; }
    if (suffix) seen.add(suffix);
    return { phone: phone || String(item.phone || '').slice(0, 30), name: item.name.slice(0, 120) || null, lead_id: item.lead_id, data: item.data, status, error_msg: error, position: index };
  });
  if (!contacts.some((contact) => contact.status === 'pending')) return { error: 'Nenhum contato válido para receber a campanha.', status: 400 };

  const now = nowIso();
  const { data: campaign, error } = await db
    .from('blast_campaigns')
    .insert({
      tenant_id: tenantId,
      ...fields,
      status: start.status,
      scheduled_at: start.status === 'scheduled' ? start.scheduledAt : null,
      started_at: start.status === 'running' ? now : null,
      next_send_at: start.status === 'running' ? now : null,
      total_contacts: contacts.length,
      created_by: actor.id,
    })
    .select('id')
    .single();
  if (error || !campaign) return { error: missingTable(error?.message) ? MIGRATION_HINT : error?.message || 'Não foi possível criar a campanha.', status: 500 };

  for (let index = 0; index < contacts.length; index += 500) {
    const { error: insertError } = await db.from('blast_contacts').insert(contacts.slice(index, index + 500).map((contact) => ({ ...contact, tenant_id: tenantId, campaign_id: campaign.id })));
    if (insertError) {
      await db.from('blast_contacts').delete().eq('tenant_id', tenantId).eq('campaign_id', campaign.id);
      await db.from('blast_campaigns').delete().eq('tenant_id', tenantId).eq('id', campaign.id);
      return { error: insertError.message, status: 500 };
    }
  }
  await syncCounts(tenantId, campaign.id);
  return { id: campaign.id };
}

function startFrom(action: unknown, scheduledAt: unknown): { status: CampaignStatus; scheduledAt?: string } | Failure {
  if (action === 'start') return { status: 'running' };
  if (action === 'schedule') {
    const date = new Date(String(scheduledAt || ''));
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60_000) return { error: 'Escolha uma data e hora no futuro para agendar.', status: 400 };
    return { status: 'scheduled', scheduledAt: date.toISOString() };
  }
  return { status: 'draft' };
}

export async function createCampaign(tenantId: string, actor: Actor, input: CreateInput): Promise<{ id: string } | Failure> {
  const fields = await campaignFields(tenantId, input);
  if ('error' in fields) return fields as Failure;
  const start = startFrom(input.action, input.scheduledAt);
  if ('error' in start) return start;

  const audience = (input.audience || {}) as NonNullable<CreateInput['audience']>;
  let recipients: Recipient[] = [];
  if (audience.type === 'crm') {
    const crm: CrmAudience = { type: 'crm', stageIds: stringArray(audience.stageIds), tags: stringArray(audience.tags), assignedTo: stringArray(audience.assignedTo), createdWithinDays: Number(audience.createdWithinDays) || null };
    recipients = await crmRecipients(tenantId, crm);
    fields.audience = crm;
    fields.columns_config = [{ key: 'nome', var: 'nome', isName: true }, { key: 'telefone', var: 'telefone', isPhone: true }, { key: 'email', var: 'email' }];
  } else {
    const rows = Array.isArray(audience.rows) ? (audience.rows as Row[]).slice(0, MAX_RECIPIENTS) : [];
    const columns = (Array.isArray(audience.columns) ? audience.columns : []) as ColumnConfig[];
    const phoneColumn = columns.find((column) => column.isPhone)?.key;
    const nameColumn = columns.find((column) => column.isName)?.key;
    if (!phoneColumn) return { error: 'Marque qual coluna da planilha é o telefone.', status: 400 };
    if (rows.length === 0) return { error: 'A planilha está vazia.', status: 400 };
    recipients = rows.map((row) => {
      const data = Object.fromEntries(Object.entries(row).slice(0, 40).map(([key, value]) => [String(key).slice(0, 60), String(value ?? '').slice(0, 500)]));
      return { phone: data[phoneColumn] || '', name: nameColumn ? data[nameColumn] || '' : '', lead_id: null, data };
    });
    fields.audience = { type: 'file', fileName: text(audience.fileName, 120) };
    fields.columns_config = columns.slice(0, 40).map((column) => ({ key: String(column.key).slice(0, 60), var: columnVariable(String(column.key)), isPhone: Boolean(column.isPhone), isName: Boolean(column.isName) }));
  }
  if (recipients.length === 0) return { error: 'Nenhum contato no público escolhido.', status: 400 };

  const created = await insertCampaign(tenantId, actor, fields, recipients, start);
  if ('id' in created) {
    await logAudit({ id: actor.id, name: actor.name }, 'CAMPAIGN', `Criou a campanha "${fields.name}" (${recipients.length} contatos${start.status === 'running' ? ', envio iniciado' : start.status === 'scheduled' ? ', agendada' : ''}).`, 'campaign', created.id, db, tenantId).catch(() => {});
  }
  return created;
}

// ── Ações ───────────────────────────────────────────────────

export type CampaignAction = 'start' | 'pause' | 'resume' | 'cancel' | 'retry_failed' | 'schedule' | 'duplicate';
const ACTION_LABEL: Record<CampaignAction, string> = { start: 'iniciou', resume: 'retomou', pause: 'pausou', cancel: 'cancelou', retry_failed: 'reenviou as falhas de', schedule: 'agendou', duplicate: 'duplicou' };

export async function campaignAction(tenantId: string, actor: Actor, id: string, action: CampaignAction, extra: { scheduledAt?: unknown } = {}): Promise<{ ok: true; id?: string } | Failure> {
  const { data: row } = await db.from('blast_campaigns').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!row) return { error: 'Campanha não encontrada.', status: 404 };
  const status = row.status as CampaignStatus;
  const update = (changes: Row) => db.from('blast_campaigns').update({ ...changes, updated_at: nowIso() }).eq('tenant_id', tenantId).eq('id', id);
  const run = { status: 'running', started_at: row.started_at || nowIso(), next_send_at: nowIso(), fail_streak: 0, last_error: null, status_detail: null, finished_at: null };

  switch (action) {
    case 'start':
    case 'resume': {
      if (!['draft', 'paused', 'scheduled'].includes(status)) return { error: 'Esta campanha não pode ser iniciada agora.', status: 409 };
      const { count } = await db.from('blast_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('campaign_id', id).eq('status', 'pending');
      if (!count) return { error: 'Não há contatos na fila desta campanha.', status: 409 };
      await update(run);
      break;
    }
    case 'schedule': {
      if (!['draft', 'paused', 'scheduled'].includes(status)) return { error: 'Só rascunhos e campanhas pausadas podem ser agendados.', status: 409 };
      const start = startFrom('schedule', extra.scheduledAt);
      if ('error' in start) return start as Failure;
      await update({ status: 'scheduled', scheduled_at: start.scheduledAt, status_detail: null });
      break;
    }
    case 'pause':
      if (!['running', 'scheduled'].includes(status)) return { error: 'Esta campanha não está enviando.', status: 409 };
      await update({ status: 'paused', status_detail: `Pausada por ${actor.name}.`, next_send_at: null });
      break;
    case 'cancel':
      if (['completed', 'canceled'].includes(status)) return { error: 'Esta campanha já terminou.', status: 409 };
      await update({ status: 'canceled', finished_at: nowIso(), next_send_at: null, status_detail: `Cancelada por ${actor.name}.` });
      await db.from('blast_contacts').update({ status: 'canceled' }).eq('tenant_id', tenantId).eq('campaign_id', id).eq('status', 'pending');
      await syncCounts(tenantId, id);
      break;
    case 'retry_failed': {
      if (status === 'canceled') return { error: 'A campanha foi cancelada. Duplique para enviar de novo.', status: 409 };
      const { data: failed } = await db.from('blast_contacts').update({ status: 'pending', error_msg: null }).eq('tenant_id', tenantId).eq('campaign_id', id).eq('status', 'failed').select('id');
      if (!failed?.length) return { error: 'Não há envios com falha.', status: 409 };
      await syncCounts(tenantId, id);
      if (status !== 'running') await update(run);
      break;
    }
    case 'duplicate': {
      const { data: contacts } = await db.from('blast_contacts').select('phone, name, lead_id, data').eq('tenant_id', tenantId).eq('campaign_id', id).order('position').limit(MAX_RECIPIENTS);
      const fields: Row = {};
      for (const key of ['channel', 'template', 'variants', 'meta_template', 'media_url', 'media_kind', 'media_name', 'optout_text', 'delay_min', 'delay_max', 'send_window', 'daily_limit', 'create_leads', 'route_type', 'route_to_id', 'route_to_label', 'tag_on_reply', 'flow_on_reply', 'audience', 'columns_config']) fields[key] = row[key];
      fields.name = `${row.name} (cópia)`.slice(0, 80);
      const created = await insertCampaign(tenantId, actor, fields, ((contacts || []) as Row[]).map((contact) => ({ phone: contact.phone, name: contact.name || '', lead_id: contact.lead_id, data: contact.data || {} })), { status: 'draft' });
      if ('error' in created) return created;
      await logAudit({ id: actor.id, name: actor.name }, 'CAMPAIGN', `Duplicou a campanha "${row.name}".`, 'campaign', created.id, db, tenantId).catch(() => {});
      return { ok: true, id: created.id };
    }
  }
  await logAudit({ id: actor.id, name: actor.name }, 'CAMPAIGN', `${actor.name} ${ACTION_LABEL[action]} a campanha "${row.name}".`, 'campaign', id, db, tenantId).catch(() => {});
  return { ok: true };
}

/** Rascunho: dá para trocar nome, mensagem e configurações de envio (o público não). */
export async function updateDraft(tenantId: string, id: string, input: CreateInput): Promise<{ ok: true } | Failure> {
  const { data: row } = await db.from('blast_campaigns').select('status').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!row) return { error: 'Campanha não encontrada.', status: 404 };
  if (!['draft', 'paused', 'scheduled'].includes(row.status)) return { error: 'Pause a campanha antes de editar.', status: 409 };
  const fields = await campaignFields(tenantId, input);
  if ('error' in fields) return fields as Failure;
  await db.from('blast_campaigns').update({ ...fields, updated_at: nowIso() }).eq('tenant_id', tenantId).eq('id', id);
  return { ok: true };
}

export async function deleteCampaign(tenantId: string, actor: Actor, id: string): Promise<{ ok: true } | Failure> {
  const { data: row } = await db.from('blast_campaigns').select('name, status').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!row) return { error: 'Campanha não encontrada.', status: 404 };
  if (row.status === 'running') return { error: 'Pause ou cancele a campanha antes de excluir.', status: 409 };
  await db.from('blast_contacts').delete().eq('tenant_id', tenantId).eq('campaign_id', id);
  const { error } = await db.from('blast_campaigns').delete().eq('tenant_id', tenantId).eq('id', id);
  if (error) return { error: error.message, status: 500 };
  await logAudit({ id: actor.id, name: actor.name }, 'CAMPAIGN', `Excluiu a campanha "${row.name}".`, 'campaign', id, db, tenantId).catch(() => {});
  return { ok: true };
}

// ── Teste ───────────────────────────────────────────────────

export async function companyOf(tenantId: string): Promise<RunContext['company']> {
  // tenant-scope: ok (dados da própria empresa)
  const { data } = await db.from('tenants').select('*').eq('id', tenantId).maybeSingle();
  return { name: String(data?.name || ''), phone: String(data?.phone || ''), website: String(data?.website || ''), address: String(data?.address || '') };
}

/** Envia a mensagem para um número de teste, com os dados de um contato de exemplo. */
export async function sendTest(tenantId: string, input: CreateInput & { phone?: unknown; sample?: unknown }): Promise<{ text: string } | Failure> {
  const phone = normalizePhone(text(input.phone, 30));
  if (!phone) return { error: 'Informe um telefone válido com DDD.', status: 400 };
  const fields = await campaignFields(tenantId, { ...input, name: input.name || 'Teste' });
  if ('error' in fields) return fields as Failure;
  const sample = (input.sample && typeof input.sample === 'object' ? input.sample : {}) as Record<string, unknown>;
  const ctx = contextFor({ name: String(sample.nome || sample.name || 'Contato de teste'), phone, data: sample }, null, await companyOf(tenantId));
  const rendered = renderForContact({ template: fields.template, variants: fields.variants, optoutText: fields.optout_text, channel: fields.channel, metaTemplate: fields.meta_template }, ctx);
  const { deliverWhatsApp } = await import('@/lib/whatsapp-outbound');
  try {
    await deliverWhatsApp(tenantId, phone, fields.channel === 'api'
      ? { template: { name: fields.meta_template.name, language: fields.meta_template.language, params: rendered.params, preview: rendered.text } }
      : fields.media_url ? { mediaUrl: fields.media_url, mediaKind: fields.media_kind, caption: rendered.text, fileName: fields.media_name || undefined } : { text: rendered.text }, fields.channel);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao enviar o teste.', status: 502 };
  }
  return { text: rendered.text };
}

// ── Descadastrados ──────────────────────────────────────────

export async function listOptouts(tenantId: string) {
  const { data } = await db.from('whatsapp_optouts').select('id, phone, reason, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1000);
  return (data || []) as { id: string; phone: string; reason: string; created_at: string }[];
}

export async function addOptout(tenantId: string, phoneRaw: unknown, reason: string): Promise<{ ok: true } | Failure> {
  const phone = normalizePhone(text(phoneRaw, 30));
  if (!phone) return { error: 'Telefone inválido.', status: 400 };
  const { error } = await db.from('whatsapp_optouts').upsert({ tenant_id: tenantId, phone, reason: reason.slice(0, 200) }, { onConflict: 'tenant_id,phone', ignoreDuplicates: true });
  if (error) return { error: missingTable(error.message) ? MIGRATION_HINT : error.message, status: 500 };
  await skipPendingFor(tenantId, phone);
  return { ok: true };
}

export async function removeOptout(tenantId: string, id: string) {
  await db.from('whatsapp_optouts').delete().eq('tenant_id', tenantId).eq('id', id);
}

/** Tira o número das campanhas que ainda vão enviar. */
async function skipPendingFor(tenantId: string, phone: string) {
  const { data } = await db
    .from('blast_contacts')
    .update({ status: 'skipped', error_msg: 'Pediu para não receber campanhas.' })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .ilike('phone', `%${phoneSuffix(phone)}`)
    .select('campaign_id');
  for (const campaignId of new Set(((data || []) as Row[]).map((row) => row.campaign_id))) await syncCounts(tenantId, campaignId);
}

// ── Respostas dos contatos ──────────────────────────────────

/**
 * Mensagem recebida de um número que recebeu campanha nos últimos 7 dias:
 * marca como respondida, aplica o que a campanha pede (responsável,
 * etapa, etiqueta, automação) e trata o pedido para sair.
 */
export async function handleCampaignReply(tenantId: string, leadId: string, phoneRaw: string, message: string) {
  const suffix = phoneSuffix(phoneRaw);
  if (suffix.length < 8) return;
  const { data: found } = await db
    .from('blast_contacts')
    .select('id, campaign_id, replied_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'sent')
    .gte('sent_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    .ilike('phone', `%${suffix}`)
    .order('sent_at', { ascending: false })
    .limit(1);
  const contact = (found || [])[0] as Row | undefined;
  if (!contact) return;

  const { data: campaign } = await db.from('blast_campaigns').select('*').eq('tenant_id', tenantId).eq('id', contact.campaign_id).maybeSingle();
  if (!campaign) return;
  const firstReply = !contact.replied_at;
  await db.from('blast_contacts').update({ replied_at: contact.replied_at || nowIso(), reply_text: message.slice(0, 500), lead_id: leadId }).eq('tenant_id', tenantId).eq('id', contact.id);

  if (isOptOut(message)) {
    const phone = normalizePhone(phoneRaw) || phoneRaw.replace(/\D/g, '');
    await db.from('whatsapp_optouts').upsert({ tenant_id: tenantId, phone, reason: `Respondeu "${message.slice(0, 60)}" à campanha ${campaign.name}`, campaign_id: campaign.id }, { onConflict: 'tenant_id,phone', ignoreDuplicates: true });
    await db.from('blast_campaigns').update({ optout_count: (Number(campaign.optout_count) || 0) + 1 }).eq('tenant_id', tenantId).eq('id', campaign.id);
    await skipPendingFor(tenantId, phone);
    try {
      const { deliverWhatsApp, recordOutbound } = await import('@/lib/whatsapp-outbound');
      const sent = await deliverWhatsApp(tenantId, phoneRaw, { text: 'Pronto! Você não vai mais receber nossas campanhas. Se precisar de algo, é só mandar uma mensagem por aqui.' });
      await recordOutbound(tenantId, leadId, sent, {}, '📣');
    } catch (error) {
      console.error('[disparos] confirmação de descadastro falhou', error instanceof Error ? error.message : error);
    }
  } else if (firstReply) {
    const updates: Row = {};
    if (campaign.route_type === 'user' && campaign.route_to_id) updates.assigned_to = campaign.route_to_id;
    if (campaign.route_type === 'stage' && campaign.route_to_id) updates.stage_id = campaign.route_to_id;
    const { data: lead } = await db.from('leads').select('stage_id, tags').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
    if (campaign.tag_on_reply && lead) {
      const tags = Array.isArray(lead.tags) ? lead.tags : [];
      if (!tags.some((tag: string) => tag.toLowerCase() === String(campaign.tag_on_reply).toLowerCase())) updates.tags = [...tags, campaign.tag_on_reply];
    }
    if (Object.keys(updates).length) await db.from('leads').update(updates).eq('tenant_id', tenantId).eq('id', leadId);
    const { fireAutomation, onStageChanged, onTagAdded, startFlowForLeads } = await import('@/lib/automations/engine');
    if (updates.stage_id && lead && updates.stage_id !== lead.stage_id) fireAutomation(onStageChanged, tenantId, leadId, String(updates.stage_id));
    if (updates.tags) fireAutomation(onTagAdded, tenantId, leadId, String(campaign.tag_on_reply));
    if (campaign.flow_on_reply) fireAutomation(startFlowForLeads, tenantId, String(campaign.flow_on_reply), [leadId]);
  }
  await syncCounts(tenantId, campaign.id);
}

/** Para a tela: etapas, equipe, etiquetas, automações e canais do WhatsApp. */
export async function campaignOptions(tenantId: string) {
  const { availableChannels } = await import('@/lib/whatsapp-outbound');
  const [{ data: stages }, { data: team }, { data: tags }, { data: flows }, channels, company] = await Promise.all([
    db.from('pipeline_stages').select('id, name').eq('tenant_id', tenantId).order('position'),
    db.from('profiles').select('id, name').eq('tenant_id', tenantId).eq('status', 'ACTIVE').order('name'),
    db.from('lead_tags').select('name').eq('tenant_id', tenantId).order('name'),
    db.from('automation_flows').select('id, name, status').eq('tenant_id', tenantId).order('name'),
    availableChannels(tenantId),
    companyOf(tenantId),
  ]);
  return {
    stages: stages || [],
    team: team || [],
    tags: (tags || []).map((tag) => String(tag.name)),
    flows: flows || [],
    channels,
    company,
    worker: process.env.CONTENT_SCHEDULER_ENABLED === 'true',
  };
}
