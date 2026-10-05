/**
 * ============================================================
 * VTEC OS — Agendamento (agenda, tarefas e envios agendados), server-only
 * ============================================================
 * Datas e horas são do fuso de São Paulo: a tela manda "AAAA-MM-DD" e
 * "HH:MM" e o servidor guarda também o instante absoluto (starts_at /
 * send_at), que é o que os lembretes e o envio automático usam.
 *
 * Quem vê o quê:
 * - Admin e gerente: tudo da empresa.
 * - Vendedor: o que criou, o que é dele e o que não tem responsável;
 *   só agenda envios para os próprios leads.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadChatLead } from '@/services/conversations.service';

type Row = Record<string, unknown>;
type Profile = { id: string; role: string };
export type Failure = { error: string; status: number };

/** Envios também têm `error` e `status` (texto): a falha da operação tem status numérico. */
export const isFailure = (value: unknown): value is Failure => typeof (value as Failure)?.status === 'number';

export const TIME_ZONE = 'America/Sao_Paulo';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isManager = (profile: Profile) => ['ADMIN', 'MANAGER'].includes(profile.role);

/** "2026-10-12" + "14:30" (horário de São Paulo, sem horário de verão desde 2019) → Date. */
export function zonedDate(date: string, time?: string | null) {
  return new Date(`${date}T${time || '00:00'}:00-03:00`);
}

const validDate = (value: string) => DATE_RE.test(value) && !Number.isNaN(zonedDate(value).getTime());

// ── Compromissos e tarefas ─────────────────────────────────

export interface AgendaItem {
  id: string;
  type: 'task' | 'event';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in-progress' | 'done';
  date: string;
  time: string | null;
  leadId: string | null;
  leadName: string | null;
  assignedTo: string | null;
  createdBy: string | null;
  remindMinutes: number | null;
}

function mapItem(row: Row): AgendaItem {
  const lead = row.lead_ref as { name?: string } | null;
  return {
    id: String(row.id),
    type: row.type === 'task' ? 'task' : 'event',
    title: String(row.title || ''),
    description: String(row.description || ''),
    priority: (['low', 'medium', 'high'].includes(String(row.priority)) ? row.priority : 'medium') as AgendaItem['priority'],
    status: (['todo', 'in-progress', 'done'].includes(String(row.status)) ? row.status : 'todo') as AgendaItem['status'],
    date: String(row.date || ''),
    time: row.time ? String(row.time).slice(0, 5) : null,
    leadId: (row.lead_id as string) || null,
    // Itens antigos guardavam o nome do lead como texto solto.
    leadName: lead?.name || (row.legacy_lead as string) || null,
    assignedTo: (row.assigned_to as string) || null,
    createdBy: (row.created_by as string) || null,
    remindMinutes: typeof row.remind_minutes === 'number' ? row.remind_minutes : null,
  };
}

const ITEM_SELECT = 'id, type, title, description, priority, status, date, time, lead_id, assigned_to, created_by, remind_minutes, legacy_lead:lead, lead_ref:leads(name)';

function visibleTo<Q extends { or: (filter: string) => Q }>(query: Q, profile: Profile) {
  return isManager(profile) ? query : query.or(`created_by.eq.${profile.id},assigned_to.eq.${profile.id},assigned_to.is.null`);
}

/** Itens de um intervalo de datas (agenda), todas as tarefas em aberto + concluídas recentes (quadro) ou um item (link do lembrete). */
export async function listItems(tenantId: string, profile: Profile, range: { from?: string; to?: string; tasks?: boolean; id?: string }) {
  let query = supabaseAdmin.from('scheduling_items').select(ITEM_SELECT).eq('tenant_id', tenantId);
  if (range.id) {
    if (!/^[0-9a-f-]{36}$/i.test(range.id)) return [];
    query = query.eq('id', range.id);
  } else if (range.tasks) {
    query = query.eq('type', 'task');
  } else {
    if (range.from && DATE_RE.test(range.from)) query = query.gte('date', range.from);
    if (range.to && DATE_RE.test(range.to)) query = query.lte('date', range.to);
  }
  const { data, error } = await visibleTo(query, profile).order('date').order('time', { nullsFirst: true }).limit(1000);
  if (error) throw new Error(error.message);
  const items = (data || []).map((row) => mapItem(row as unknown as Row));
  if (!range.tasks || range.id) return items;
  // Quadro de tarefas: as abertas + as concluídas nos últimos 30 dias.
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  return items.filter((item) => item.status !== 'done' || item.date >= cutoff);
}

async function activeMember(tenantId: string, userId: string) {
  const { data } = await supabaseAdmin.from('profiles').select('id').eq('tenant_id', tenantId).eq('id', userId).eq('status', 'ACTIVE').maybeSingle();
  return Boolean(data);
}

async function leadOf(tenantId: string, leadId: string) {
  const { data } = await supabaseAdmin.from('leads').select('id, name, assigned_to').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
  return data as { id: string; name: string; assigned_to: string | null } | null;
}

/** Confere e normaliza o que veio da tela. `current`: item sendo editado. */
async function itemPayload(tenantId: string, profile: Profile, body: Row, current?: Row): Promise<Row | Failure> {
  const has = (key: string) => current === undefined || key in body;
  const out: Row = {};

  if (has('title')) {
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
    if (!title) return { error: 'Dê um título.', status: 400 };
    out.title = title;
  }
  if (has('description')) out.description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '';
  if (has('type')) out.type = body.type === 'task' ? 'task' : 'event';
  if (has('priority')) out.priority = ['low', 'medium', 'high'].includes(String(body.priority)) ? body.priority : 'medium';
  if (has('status')) out.status = ['todo', 'in-progress', 'done'].includes(String(body.status)) ? body.status : 'todo';

  const date = has('date') ? String(body.date || '') : String(current?.date || '');
  const time = has('time') ? (body.time ? String(body.time).slice(0, 5) : null) : ((current?.time as string) || null);
  if (has('date') || has('time')) {
    if (!validDate(date)) return { error: 'Escolha uma data válida.', status: 400 };
    if (time && !TIME_RE.test(time)) return { error: 'Horário inválido.', status: 400 };
    out.date = date;
    out.time = time;
    out.starts_at = zonedDate(date, time).toISOString();
    out.reminded_at = null; // mudou o horário: o lembrete vale de novo
  }

  if (has('remindMinutes') || 'time' in out) {
    const raw = has('remindMinutes') ? body.remindMinutes : current?.remind_minutes;
    const minutes = raw === null || raw === undefined || raw === '' ? null : Math.round(Number(raw));
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 10080)) return { error: 'Lembrete inválido.', status: 400 };
    // Sem horário (dia todo) não há o que lembrar.
    out.remind_minutes = time ? minutes : null;
    if (has('remindMinutes')) out.reminded_at = null;
  }

  if (has('leadId')) {
    const leadId = typeof body.leadId === 'string' && body.leadId ? body.leadId : null;
    if (leadId) {
      const lead = await leadOf(tenantId, leadId);
      if (!lead) return { error: 'Lead não encontrado.', status: 400 };
      if (!isManager(profile) && lead.assigned_to !== profile.id) return { error: 'Este lead está com outra pessoa da equipe.', status: 403 };
    }
    out.lead_id = leadId;
    out.lead = null; // nome antigo em texto solto
  }

  if (has('assignedTo')) {
    const assignedTo = typeof body.assignedTo === 'string' && body.assignedTo ? body.assignedTo : null;
    if (!isManager(profile) && assignedTo && assignedTo !== profile.id) return { error: 'Você só pode marcar compromissos para você mesmo.', status: 403 };
    if (assignedTo && !(await activeMember(tenantId, assignedTo))) return { error: 'Escolha alguém ativo da equipe.', status: 400 };
    // Vendedor sem responsável escolhido: fica com ele.
    out.assigned_to = assignedTo || (isManager(profile) ? null : profile.id);
    if (current && out.assigned_to !== current.assigned_to) out.reminded_at = null;
  }
  return out;
}

const canEdit = (profile: Profile, row: Row) =>
  isManager(profile) || row.created_by === profile.id || row.assigned_to === profile.id || (!row.assigned_to && !row.created_by);

export async function createItem(tenantId: string, profile: Profile, body: Row): Promise<AgendaItem | Failure> {
  const payload = await itemPayload(tenantId, profile, body);
  if ('error' in payload) return payload as Failure;
  const { data, error } = await supabaseAdmin
    .from('scheduling_items')
    .insert({ ...payload, tenant_id: tenantId, created_by: profile.id })
    .select(ITEM_SELECT)
    .single();
  if (error || !data) return { error: error?.message || 'Não foi possível salvar.', status: 500 };
  return mapItem(data as unknown as Row);
}

async function loadItem(tenantId: string, id: string) {
  const { data } = await supabaseAdmin.from('scheduling_items').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  return (data as Row) || null;
}

export async function updateItem(tenantId: string, profile: Profile, id: string, body: Row): Promise<AgendaItem | Failure> {
  const current = await loadItem(tenantId, id);
  if (!current) return { error: 'Item não encontrado.', status: 404 };
  if (!canEdit(profile, current)) return { error: 'Só quem criou, o responsável ou um gerente pode alterar.', status: 403 };
  const payload = await itemPayload(tenantId, profile, body, current);
  if ('error' in payload) return payload as Failure;
  const { data, error } = await supabaseAdmin
    .from('scheduling_items')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(ITEM_SELECT)
    .single();
  if (error || !data) return { error: error?.message || 'Não foi possível salvar.', status: 500 };
  return mapItem(data as unknown as Row);
}

export async function deleteItem(tenantId: string, profile: Profile, id: string): Promise<true | Failure> {
  const current = await loadItem(tenantId, id);
  if (!current) return { error: 'Item não encontrado.', status: 404 };
  if (!canEdit(profile, current)) return { error: 'Só quem criou, o responsável ou um gerente pode excluir.', status: 403 };
  const { error } = await supabaseAdmin.from('scheduling_items').delete().eq('tenant_id', tenantId).eq('id', id);
  return error ? { error: error.message, status: 500 } : true;
}

// ── Envios agendados (WhatsApp) ────────────────────────────

export interface ScheduledSend {
  id: string;
  leadId: string | null;
  leadName: string;
  message: string;
  templateName: string | null;
  date: string;
  time: string;
  sendAt: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'canceled';
  error: string | null;
  sentAt: string | null;
  createdBy: string | null;
}

function mapSend(row: Row): ScheduledSend {
  return {
    id: String(row.id),
    leadId: (row.lead_id as string) || null,
    leadName: String(row.lead_name || 'Lead'),
    message: String(row.message || ''),
    templateName: (row.template_name as string) || null,
    date: String(row.scheduled_date || ''),
    time: String(row.scheduled_time || '').slice(0, 5),
    sendAt: (row.send_at as string) || null,
    status: (['pending', 'sending', 'sent', 'failed', 'canceled'].includes(String(row.status)) ? row.status : 'pending') as ScheduledSend['status'],
    error: (row.error as string) || null,
    sentAt: (row.sent_at as string) || null,
    createdBy: (row.created_by as string) || null,
  };
}

/** O envio automático só roda no servidor de produção com o agendador ligado (VPS). */
export const sendWorkerEnabled = () => process.env.NODE_ENV === 'production' && process.env.CONTENT_SCHEDULER_ENABLED === 'true';

export async function listSends(tenantId: string, profile: Profile) {
  let query = supabaseAdmin.from('scheduled_messages').select('*').eq('tenant_id', tenantId);
  if (!isManager(profile)) query = query.eq('created_by', profile.id);
  const { data, error } = await query.order('send_at', { ascending: false, nullsFirst: false }).limit(300);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapSend(row as Row));
}

/** Data/hora e texto conferidos. O horário precisa estar pelo menos 1 min à frente. */
function sendTiming(body: Row): { date: string; time: string; sendAt: Date } | Failure {
  const date = String(body.date || '');
  const time = String(body.time || '').slice(0, 5);
  if (!validDate(date) || !TIME_RE.test(time)) return { error: 'Escolha data e horário.', status: 400 };
  const sendAt = zonedDate(date, time);
  if (sendAt.getTime() < Date.now() + 60_000) return { error: 'Escolha um horário no futuro.', status: 400 };
  if (sendAt.getTime() > Date.now() + 366 * 86400_000) return { error: 'Agende para no máximo um ano à frente.', status: 400 };
  return { date, time, sendAt };
}

export async function createSend(tenantId: string, profile: Profile, body: Row): Promise<ScheduledSend | Failure> {
  const leadId = typeof body.leadId === 'string' ? body.leadId : '';
  if (!leadId) return { error: 'Escolha o lead.', status: 400 };
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4096) : '';
  if (!message) return { error: 'Escreva a mensagem.', status: 400 };
  const timing = sendTiming(body);
  if (isFailure(timing)) return timing;

  const lead = await loadChatLead(tenantId, leadId, profile);
  if ('error' in lead) return { error: lead.error, status: lead.status };
  if (!lead.phone) return { error: 'Este lead não tem telefone.', status: 400 };
  if (lead.blocked) return { error: 'Este contato está bloqueado.', status: 400 };

  const { data, error } = await supabaseAdmin
    .from('scheduled_messages')
    .insert({
      tenant_id: tenantId,
      channel: 'WhatsApp',
      lead_id: lead.id,
      lead_name: lead.name,
      scheduled_date: timing.date,
      scheduled_time: timing.time,
      send_at: timing.sendAt.toISOString(),
      template_name: typeof body.templateName === 'string' && body.templateName ? body.templateName.slice(0, 120) : null,
      message,
      status: 'pending',
      created_by: profile.id,
    })
    .select('*')
    .single();
  if (error || !data) return { error: error?.message || 'Não foi possível agendar.', status: 500 };
  return mapSend(data as Row);
}

async function loadSend(tenantId: string, profile: Profile, id: string): Promise<Row | Failure> {
  const { data } = await supabaseAdmin.from('scheduled_messages').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!data) return { error: 'Envio não encontrado.', status: 404 };
  if (!isManager(profile) && data.created_by !== profile.id) return { error: 'Só quem agendou ou um gerente pode alterar.', status: 403 };
  return data as Row;
}

/** Altera texto/horário de um envio pendente, ou reagenda um que falhou/foi cancelado. */
export async function updateSend(tenantId: string, profile: Profile, id: string, body: Row): Promise<ScheduledSend | Failure> {
  const current = await loadSend(tenantId, profile, id);
  if (isFailure(current)) return current;
  if (!['pending', 'failed', 'canceled'].includes(String(current.status))) return { error: 'Este envio já saiu ou está saindo agora.', status: 409 };

  const timing = sendTiming({ date: body.date ?? current.scheduled_date, time: body.time ?? current.scheduled_time });
  if (isFailure(timing)) return timing;
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4096) : String(current.message || '');
  if (!message) return { error: 'Escreva a mensagem.', status: 400 };

  const { data, error } = await supabaseAdmin
    .from('scheduled_messages')
    .update({
      message,
      scheduled_date: timing.date,
      scheduled_time: timing.time,
      send_at: timing.sendAt.toISOString(),
      status: 'pending',
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .in('status', ['pending', 'failed', 'canceled'])
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Este envio já saiu ou está saindo agora.', status: 409 };
  return mapSend(data as Row);
}

export async function cancelSend(tenantId: string, profile: Profile, id: string): Promise<ScheduledSend | Failure> {
  const current = await loadSend(tenantId, profile, id);
  if (isFailure(current)) return current;
  const { data, error } = await supabaseAdmin
    .from('scheduled_messages')
    .update({ status: 'canceled', error: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Só dá para cancelar envios que ainda não saíram.', status: 409 };
  return mapSend(data as Row);
}
