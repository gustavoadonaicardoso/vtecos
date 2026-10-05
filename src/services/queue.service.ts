/**
 * ============================================================
 * VÓRTICE CRM — Fila de Atendimento Service
 * ============================================================
 * Operações de banco para a fila de senhas (attendance_queue_tickets).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { sendWhatsAppWebMessage } from '@/lib/whatsapp-web';
import { emitIntegrationEvent, leadEventData } from '@/lib/integrations/events';
import { fireAutomation, onLeadCreated } from '@/lib/automations/engine';
import { logAudit } from '@/lib/audit';
import {
  DEFAULT_QUEUE_SETTINGS,
  deskName,
  firstName,
  ticketCode,
  type QueueSettings,
  type QueueTicket,
  type TicketOrigin,
  type TicketStatus,
} from '@/lib/queue';

export type { TicketOrigin };
type Row = Record<string, unknown>;
type Actor = { id: string; name: string };
type Tenant = { id: string; name: string };

const ORIGIN_LABEL: Record<TicketOrigin, string> = {
  totem: 'Totem',
  recepcao: 'Recepção',
};

/** Nome padrão da senha manual sem dados -- não vira lead (não identifica ninguém). */
export const ANONYMOUS_TICKET_NAME = 'Cliente (Manual)';

/**
 * Todo nome/WhatsApp/documento que entra na fila vira lead. Se a pessoa já
 * existe (mesmo WhatsApp ou mesmo documento), atualiza o lead em vez de
 * duplicar: completa dados que faltavam, marca a tag "Senha" e registra a
 * atividade. Roda no servidor porque o Totem é público e a tabela de leads
 * não aceita escrita anônima -- antes, a criação pelo navegador falhava
 * em silêncio. Nunca derruba a emissão da senha.
 */
export async function syncLeadFromTicket(tenantId: string, params: {
  name: string;
  whatsapp: string | null;
  document: string | null;
  origin: TicketOrigin;
}): Promise<void> {
  const name = params.name.trim();
  const hasIdentity = Boolean(params.whatsapp || params.document);
  if (!hasIdentity && (!name || name === ANONYMOUS_TICKET_NAME)) return;

  const now = new Date().toISOString();
  const originLabel = ORIGIN_LABEL[params.origin];

  try {
    let existing: { id: string; name: string | null; phone: string | null; cpf_cnpj: string | null; tags: string[] | null } | null = null;
    if (params.whatsapp) {
      const { data } = await supabase.from('leads').select('id, name, phone, cpf_cnpj, tags').eq('tenant_id', tenantId).eq('phone', params.whatsapp).limit(1).maybeSingle();
      existing = data;
    }
    if (!existing && params.document) {
      const { data } = await supabase.from('leads').select('id, name, phone, cpf_cnpj, tags').eq('tenant_id', tenantId).eq('cpf_cnpj', params.document).limit(1).maybeSingle();
      existing = data;
    }

    if (existing) {
      const tags = [...new Set([...(existing.tags || []), 'Senha', originLabel])];
      const { error } = await supabase
        .from('leads')
        .update({
          name: existing.name?.trim() ? existing.name : name,
          phone: existing.phone || params.whatsapp,
          cpf_cnpj: existing.cpf_cnpj || params.document,
          tags,
          last_activity_at: now,
          last_msg: `Retirou senha (${originLabel})`,
        })
        .eq('tenant_id', tenantId)
        .eq('id', existing.id);
      if (error) console.error('[QueueService] Falha ao atualizar lead da senha:', error.message);
      return;
    }

    const { data: firstStage } = await supabase.from('pipeline_stages').select('id').eq('tenant_id', tenantId).order('position').limit(1).maybeSingle();
    const { data: created, error } = await supabase.from('leads').insert([{
      tenant_id: tenantId,
      name: name || 'Visitante',
      phone: params.whatsapp,
      cpf_cnpj: params.document,
      source: originLabel === 'Totem' ? 'Totem' : 'Recepção (senha)',
      stage_id: firstStage?.id || 'novo',
      tags: ['Senha', originLabel, 'Presencial'],
      last_activity_at: now,
      last_msg: `Retirou senha (${originLabel})`,
    }]).select().maybeSingle();
    if (error) console.error('[QueueService] Falha ao criar lead da senha:', error.message);
    else if (created) {
      emitIntegrationEvent(tenantId, 'lead.created', leadEventData(created, 'totem'));
      fireAutomation(onLeadCreated, tenantId, String(created.id), 'totem');
    }
  } catch (error) {
    console.error('[QueueService] Falha ao sincronizar lead da senha:', error);
  }
}

// ── Dia da fila e leitura ──────────────────────────────────────

/** Dia da fila no fuso de São Paulo (a numeração recomeça a cada dia). */
export const queueToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const TICKET_COLUMNS = 'id, number, name, priority, status, desk, origin, created_at, called_at, finished_at, called_by, call_count';

export function mapTicket(row: Row): QueueTicket {
  return {
    id: String(row.id),
    number: Number(row.number) || 0,
    name: String(row.name || ''),
    priority: row.priority === true,
    status: (['waiting', 'calling', 'completed', 'no_show', 'canceled'].includes(String(row.status)) ? row.status : 'waiting') as TicketStatus,
    desk: (row.desk as string) || null,
    origin: row.origin === 'recepcao' ? 'recepcao' : row.origin === 'totem' ? 'totem' : null,
    createdAt: String(row.created_at || ''),
    calledAt: (row.called_at as string) || null,
    finishedAt: (row.finished_at as string) || null,
    calledBy: (row.called_by as string) || null,
    callCount: Number(row.call_count) || 0,
  };
}

/** Todas as senhas de hoje da empresa (a recepção monta fila, atendimento e histórico). */
export async function listTodayTickets(tenantId: string) {
  const { data, error } = await supabase
    .from('attendance_queue_tickets')
    .select(TICKET_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('queue_date', queueToday())
    .order('number');
  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapTicket(row as Row));
}

// ── Configurações da fila ──────────────────────────────────────

export async function getQueueSettings(tenant: Tenant): Promise<QueueSettings> {
  const { data } = await supabase.from('queue_settings').select('*').eq('tenant_id', tenant.id).maybeSingle();
  const row = (data || {}) as Row;
  return {
    appName: String(row.app_name || '') || tenant.name,
    totalDesks: Math.max(1, Math.min(99, Number(row.total_desks) || DEFAULT_QUEUE_SETTINGS.totalDesks)),
    deskLabel: String(row.desk_label || '') || DEFAULT_QUEUE_SETTINGS.deskLabel,
    primaryColor: /^#[0-9a-f]{6}$/i.test(String(row.primary_color || '')) ? String(row.primary_color) : DEFAULT_QUEUE_SETTINGS.primaryColor,
    welcomeText: String(row.welcome_text || ''),
    logoUrl: String(row.logo_url || ''),
    bannerUrl: String(row.banner_url || ''),
    priorityEnabled: row.priority_enabled !== false,
    voiceEnabled: row.voice_enabled !== false,
  };
}

async function upsertSettings(tenantId: string, values: Row) {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('queue_settings').update({ ...values, updated_at: now }).eq('tenant_id', tenantId).select('id');
  if (error) return error.message;
  if (!data || data.length === 0) {
    const { error: insertError } = await supabase.from('queue_settings').insert({ id: tenantId, tenant_id: tenantId, ...values, updated_at: now });
    if (insertError) return insertError.message;
  }
  return null;
}

export async function saveQueueSettings(tenant: Tenant, actor: Actor, body: Row): Promise<QueueSettings | { error: string }> {
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const desks = Math.round(Number(body.totalDesks));
  if (!Number.isFinite(desks) || desks < 1 || desks > 99) return { error: 'Número de guichês: de 1 a 99.' };
  const color = text(body.primaryColor, 7);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { error: 'Cor inválida.' };

  const failure = await upsertSettings(tenant.id, {
    app_name: text(body.appName, 80) || null,
    total_desks: desks,
    desk_label: text(body.deskLabel, 20) || 'Guichê',
    primary_color: color || null,
    welcome_text: text(body.welcomeText, 140) || null,
    priority_enabled: body.priorityEnabled !== false,
    voice_enabled: body.voiceEnabled !== false,
    ...(body.logoUrl === '' ? { logo_url: null } : {}),
  });
  if (failure) return { error: failure };
  void logAudit(actor, 'SETTINGS_UPDATE', 'Configurações da fila de senhas alteradas.', 'queue', tenant.id, supabase, tenant.id);
  return getQueueSettings(tenant);
}

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

/** Logo do totem e da TV: vai para o bucket público da mídia do painel. */
export async function uploadQueueLogo(tenantId: string, file: { buffer: Buffer; type: string; size: number }): Promise<{ url: string } | { error: string }> {
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: 'Use uma imagem PNG, JPG, WEBP ou SVG.' };
  if (file.size > 2 * 1024 * 1024) return { error: 'A logo pode ter no máximo 2 MB.' };
  const path = `${tenantId}/brand/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('queue-media').upload(path, file.buffer, { contentType: file.type, upsert: true });
  if (error) return { error: error.message };
  const url = supabase.storage.from('queue-media').getPublicUrl(path).data.publicUrl;
  const failure = await upsertSettings(tenantId, { logo_url: url });
  return failure ? { error: failure } : { url };
}

// ── Emissão ────────────────────────────────────────────────────

/** Lança o erro do Postgres como veio (código/detalhe/hint incluídos) para a rota logar. */
export async function createQueueTicket(tenant: Tenant, params: {
  name: string;
  whatsapp: string | null;
  document: string | null;
  origin?: TicketOrigin;
  priority?: boolean;
}): Promise<{ number: number; priority: boolean; ahead: number }> {
  const origin = params.origin ?? 'totem';
  const priority = params.priority === true;
  const { data: ticket, error } = await supabase
    .from('attendance_queue_tickets')
    .insert({ tenant_id: tenant.id, name: params.name, status: 'waiting', priority, origin })
    .select('id, number, queue_date')
    .single();

  if (error) throw error;

  // whatsapp/document vivem numa tabela separada que nem anon nem
  // authenticated conseguem ler (ver 202609290001_secure_queue_pii.sql)
  // -- evita expor CPF/RG/telefone de todo mundo que já passou pelo
  // Totem via chave pública do site.
  if (params.whatsapp || params.document) {
    const { error: contactError } = await supabase
      .from('attendance_queue_contacts')
      .insert({ tenant_id: tenant.id, ticket_id: ticket.id, whatsapp: params.whatsapp, document: params.document });

    if (contactError) {
      console.error('[QueueService] Erro ao salvar contato da senha:', contactError.message);
    }
  }

  // Quantas pessoas estão na frente (preferenciais passam na frente das normais).
  let aheadQuery = supabase
    .from('attendance_queue_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('queue_date', ticket.queue_date)
    .eq('status', 'waiting')
    .neq('id', ticket.id);
  aheadQuery = priority ? aheadQuery.eq('priority', true).lt('number', ticket.number) : aheadQuery.or(`priority.eq.true,number.lt.${ticket.number}`);
  const { count: ahead } = await aheadQuery;

  await syncLeadFromTicket(tenant.id, {
    name: params.name,
    whatsapp: params.whatsapp,
    document: params.document,
    origin,
  });

  // Confirmação no WhatsApp sem segurar a resposta do Totem (o envio pode demorar).
  if (params.whatsapp) {
    const settings = await getQueueSettings(tenant);
    const hello = firstName(params.name) ? `Olá, ${firstName(params.name)}!` : 'Olá!';
    void sendTicketWhatsApp(
      tenant.id,
      params.whatsapp,
      `🌟 *${settings.appName}* 🌟\n\n${hello} Sua senha foi retirada com sucesso.\n\nSenha: *${ticketCode(ticket.number, priority)}*${priority ? ' (preferencial)' : ''}\n\nAcompanhe o painel. Quando for sua vez, avisaremos também por aqui.`
    );
  }

  return { number: ticket.number, priority, ahead: ahead ?? 0 };
}

// ── Atendimento ────────────────────────────────────────────────

export type TicketAction = 'call' | 'recall' | 'finish' | 'no_show' | 'cancel' | 'requeue';
export type ActionResult = { ticket: QueueTicket | null; whatsapp?: { sent: boolean; reason?: string } } | { error: string; status: number };

async function audit(tenant: Tenant, actor: Actor, action: 'TICKET_CALL' | 'TICKET_COMPLETE', details: string, id: string) {
  await logAudit(actor, action, details, 'ticket', id, supabase, tenant.id);
}

/** Encerra o que estava em atendimento neste guichê (antes de chamar outra senha). */
async function finishDesk(tenantId: string, desk: string) {
  await supabase
    .from('attendance_queue_tickets')
    .update({ status: 'completed', finished_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('status', 'calling')
    .eq('desk', desk);
}

const validDesk = (desk: unknown) => typeof desk === 'string' && /^\d{1,2}$/.test(desk);

/** Chama a próxima da fila (com trava no banco: dois guichês nunca pegam a mesma). */
export async function callNextTicket(tenant: Tenant, actor: Actor, desk: string): Promise<ActionResult> {
  if (!validDesk(desk)) return { error: 'Escolha o guichê.', status: 400 };
  const { data, error } = await supabase.rpc('queue_call_next', { p_tenant: tenant.id, p_desk: desk, p_user: actor.id });
  if (error) return { error: error.message, status: 500 };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ticket: null };
  const ticket = mapTicket(row as Row);
  const settings = await getQueueSettings(tenant);
  await audit(tenant, actor, 'TICKET_CALL', `Senha ${ticketCode(ticket.number, ticket.priority)} chamada para ${deskName(settings.deskLabel, desk)}.`, ticket.id);
  return { ticket, whatsapp: await notifyTicketCall(tenant, ticket.id, 'call') };
}

export async function ticketAction(tenant: Tenant, actor: Actor, id: string, action: TicketAction, desk?: string): Promise<ActionResult> {
  const now = new Date().toISOString();
  const update = async (values: Row, fromStatus: TicketStatus) => {
    const { data, error } = await supabase
      .from('attendance_queue_tickets')
      .update(values)
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .eq('status', fromStatus)
      .select(TICKET_COLUMNS)
      .maybeSingle();
    if (error) return { error: error.message, status: 500 };
    if (!data) return { error: 'Esta senha já mudou (outra pessoa pode ter mexido). A lista foi atualizada.', status: 409 };
    return { ticket: mapTicket(data as Row) };
  };

  const settings = await getQueueSettings(tenant);
  switch (action) {
    case 'call': {
      if (!validDesk(desk)) return { error: 'Escolha o guichê.', status: 400 };
      await finishDesk(tenant.id, desk!);
      const { data: current } = await supabase.from('attendance_queue_tickets').select('call_count').eq('tenant_id', tenant.id).eq('id', id).maybeSingle();
      const result = await update({ status: 'calling', desk, called_at: now, called_by: actor.id, call_count: (Number(current?.call_count) || 0) + 1 }, 'waiting');
      if ('error' in result) return result;
      await audit(tenant, actor, 'TICKET_CALL', `Senha ${ticketCode(result.ticket.number, result.ticket.priority)} chamada fora de ordem para ${deskName(settings.deskLabel, desk!)}.`, id);
      return { ...result, whatsapp: await notifyTicketCall(tenant, id, 'call') };
    }
    case 'recall': {
      const { data: current } = await supabase.from('attendance_queue_tickets').select('call_count').eq('tenant_id', tenant.id).eq('id', id).maybeSingle();
      const result = await update({ called_at: now, call_count: (Number(current?.call_count) || 0) + 1 }, 'calling');
      if ('error' in result) return result;
      await audit(tenant, actor, 'TICKET_CALL', `Senha ${ticketCode(result.ticket.number, result.ticket.priority)} chamada de novo (${deskName(settings.deskLabel, result.ticket.desk)}).`, id);
      return { ...result, whatsapp: await notifyTicketCall(tenant, id, 'recall') };
    }
    case 'finish':
    case 'no_show': {
      const result = await update({ status: action === 'finish' ? 'completed' : 'no_show', finished_at: now }, 'calling');
      if ('error' in result) return result;
      await audit(tenant, actor, 'TICKET_COMPLETE', `Senha ${ticketCode(result.ticket.number, result.ticket.priority)} ${action === 'finish' ? 'atendida' : 'não compareceu'} (${deskName(settings.deskLabel, result.ticket.desk)}).`, id);
      return result;
    }
    case 'cancel': {
      const result = await update({ status: 'canceled', finished_at: now }, 'waiting');
      if ('error' in result) return result;
      await audit(tenant, actor, 'TICKET_COMPLETE', `Senha ${ticketCode(result.ticket.number, result.ticket.priority)} cancelada.`, id);
      return result;
    }
    case 'requeue': {
      const result = await update({ status: 'waiting', desk: null }, 'calling');
      if ('error' in result) return result;
      await audit(tenant, actor, 'TICKET_COMPLETE', `Senha ${ticketCode(result.ticket.number, result.ticket.priority)} voltou para a fila.`, id);
      return result;
    }
    default:
      return { error: 'Ação inválida.', status: 400 };
  }
}

/** Fim do expediente: quem ainda espera vira "cancelada"; quem está em atendimento, "atendida". */
export async function closeQueueDay(tenant: Tenant, actor: Actor) {
  const now = new Date().toISOString();
  const today = queueToday();
  const [{ data: canceled }, { data: finished }] = await Promise.all([
    supabase.from('attendance_queue_tickets').update({ status: 'canceled', finished_at: now }).eq('tenant_id', tenant.id).eq('queue_date', today).eq('status', 'waiting').select('id'),
    supabase.from('attendance_queue_tickets').update({ status: 'completed', finished_at: now }).eq('tenant_id', tenant.id).eq('queue_date', today).eq('status', 'calling').select('id'),
  ]);
  await logAudit(actor, 'SETTINGS_UPDATE', `Fila de senhas encerrada: ${canceled?.length || 0} canceladas, ${finished?.length || 0} finalizadas.`, 'queue', tenant.id, supabase, tenant.id);
  return { canceled: canceled?.length || 0, finished: finished?.length || 0 };
}

// ── WhatsApp da fila ───────────────────────────────────────────

/** Envia pelo WhatsApp Web conectado no sistema. Nunca lança: devolve o motivo da falha. */
async function sendTicketWhatsApp(tenantId: string, phone: string, message: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    // Sai pelo WhatsApp da própria empresa.
    await sendWhatsAppWebMessage(tenantId, phone, message);
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Falha no envio.';
    console.error('[QueueService] WhatsApp da senha não enviado:', reason);
    return { sent: false, reason };
  }
}

export type TicketNotifyKind = 'call' | 'recall';

/**
 * Avisa no WhatsApp que a senha foi chamada (ou chamada de novo) e em qual
 * guichê. O número fica em attendance_queue_contacts, que só o servidor lê.
 */
export async function notifyTicketCall(tenant: Tenant, ticketId: string, kind: TicketNotifyKind): Promise<{ sent: boolean; reason?: string }> {
  const [{ data: ticket }, { data: contact }, settings] = await Promise.all([
    supabase.from('attendance_queue_tickets').select('number, name, desk, status, priority').eq('tenant_id', tenant.id).eq('id', ticketId).maybeSingle(),
    supabase.from('attendance_queue_contacts').select('whatsapp').eq('tenant_id', tenant.id).eq('ticket_id', ticketId).maybeSingle(),
    getQueueSettings(tenant),
  ]);

  if (!ticket) return { sent: false, reason: 'Senha não encontrada.' };
  if (!contact?.whatsapp) return { sent: false, reason: 'Sem WhatsApp cadastrado.' };

  const code = ticketCode(ticket.number, ticket.priority === true);
  const desk = ticket.desk ? deskName(settings.deskLabel, ticket.desk) : 'atendimento';
  const who = firstName(ticket.name);
  const message =
    kind === 'call'
      ? `📢 *${settings.appName}*\n\n${who ? `${who}, chegou a sua vez!` : 'Chegou a sua vez!'}\n\nSenha *${code}* chamada.\nDirija-se ao *${desk}*.`
      : `🔔 *${settings.appName}*\n\nLembrete: sua senha *${code}* está sendo chamada no *${desk}*.`;

  return sendTicketWhatsApp(tenant.id, contact.whatsapp, message);
}
