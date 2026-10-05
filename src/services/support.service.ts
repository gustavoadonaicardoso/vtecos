/**
 * ============================================================
 * VTEC OS — Central de chamados (server-only)
 * ============================================================
 * Cliente = usuário de uma empresa cliente. Abre chamados da própria
 * empresa e acompanha a conversa. Admin/gerente da empresa veem todos os
 * chamados dela; os demais, só os que abriram.
 *
 * Atendimento = admin/gerente da empresa da plataforma (Vórtice). Vê os
 * chamados de todas as empresas, responde, escreve notas internas (o
 * cliente nunca vê), muda situação/prioridade e distribui.
 *
 * Toda resposta ou mudança de situação avisa o cliente no sino e, se ele
 * pediu, no WhatsApp (pelo WhatsApp conectado da Vórtice).
 * ============================================================
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { normalizeBrazilPhone, validateBrazilPhone } from '@/lib/brazilian-fields';
import {
  CATEGORY_LABEL,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  OPEN_STATUSES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  ticketLabel,
  type SupportAttachment,
  type SupportMessage,
  type SupportTicketDetail,
  type SupportTicketSummary,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support';

type Row = Record<string, unknown>;
export type Failure = { error: string; status: number };
export interface Viewer {
  profile: { id: string; name: string; email?: string | null; role: string; phone?: string | null };
  tenantId: string;
  tenantName: string;
  isPlatform: boolean;
}
export interface UploadFile {
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}

const BUCKET = 'support-files';
const STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
const CATEGORIES = Object.keys(CATEGORY_LABEL) as TicketCategory[];
const ALLOWED_TYPES = /^(image\/|application\/pdf$|text\/(plain|csv)$|application\/(msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-excel|zip|x-zip-compressed))/;

export const isStaff = (viewer: Viewer) => viewer.isPlatform && ['ADMIN', 'MANAGER'].includes(viewer.profile.role);
const isCompanyManager = (viewer: Viewer) => ['ADMIN', 'MANAGER'].includes(viewer.profile.role);
const now = () => new Date().toISOString();

// ── Apoio ──────────────────────────────────────────────────────

async function platformTenantId() {
  // tenant-scope: ok (a empresa da plataforma atende os chamados)
  const { data } = await db.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  return (data?.id as string) || null;
}

/** Equipe que atende: admin e gerente ativos da Vórtice. */
export async function supportTeam() {
  const platform = await platformTenantId();
  if (!platform) return [];
  const { data } = await db.from('profiles').select('id, name').eq('tenant_id', platform).eq('status', 'ACTIVE').in('role', ['ADMIN', 'MANAGER']).order('name');
  return (data || []) as { id: string; name: string }[];
}

async function namesOf(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, { name: string; email: string | null }>();
  // tenant-scope: ok (autores do chamado são do cliente e da Vórtice; só nome/e-mail)
  const { data } = await db.from('profiles').select('id, name, email').in('id', unique);
  return new Map((data || []).map((row) => [row.id as string, { name: String(row.name || 'Usuário'), email: (row.email as string) || null }]));
}

async function tenantNames(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, string>();
  // tenant-scope: ok (só o nome das empresas dos chamados listados)
  const { data } = await db.from('tenants').select('id, name').in('id', unique);
  return new Map((data || []).map((row) => [row.id as string, String(row.name || 'Empresa')]));
}

function summary(row: Row, viewer: Viewer, names: Map<string, { name: string }>, tenants: Map<string, string>): SupportTicketSummary {
  const staff = isStaff(viewer);
  return {
    id: String(row.id),
    code: Number(row.code),
    subject: String(row.subject || ''),
    category: (CATEGORIES.includes(row.category as TicketCategory) ? row.category : 'outro') as TicketCategory,
    priority: (PRIORITIES.includes(row.priority as TicketPriority) ? row.priority : 'normal') as TicketPriority,
    status: (STATUSES.includes(row.status as TicketStatus) ? row.status : 'open') as TicketStatus,
    tenantId: String(row.tenant_id),
    tenantName: tenants.get(String(row.tenant_id)) || '',
    openedBy: (row.opened_by as string) || null,
    openedByName: names.get(String(row.opened_by))?.name || 'Usuário removido',
    assignedTo: (row.assigned_to as string) || null,
    assignedName: row.assigned_to ? names.get(String(row.assigned_to))?.name || null : null,
    unread: staff ? row.unread_by_staff === true : row.unread_by_customer === true,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    firstResponseAt: (row.first_response_at as string) || null,
    lastCustomerAt: (row.last_customer_at as string) || null,
    lastStaffAt: (row.last_staff_at as string) || null,
  };
}

/** Chamado que esta pessoa pode ver (ou o motivo de não poder). */
async function loadTicket(viewer: Viewer, id: string): Promise<Row | Failure> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Chamado não encontrado.', status: 404 };
  // tenant-scope: ok (atendimento da Vórtice vê todas as empresas; o cliente é filtrado abaixo)
  let query = db.from('support_tickets').select('*').eq('id', id);
  if (!isStaff(viewer)) query = query.eq('tenant_id', viewer.tenantId);
  const { data } = await query.maybeSingle();
  if (!data) return { error: 'Chamado não encontrado.', status: 404 };
  if (!isStaff(viewer) && !isCompanyManager(viewer) && data.opened_by !== viewer.profile.id) {
    return { error: 'Este chamado foi aberto por outra pessoa da sua empresa.', status: 403 };
  }
  return data as Row;
}

const isFailure = (value: unknown): value is Failure => typeof (value as Failure)?.status === 'number' && typeof (value as Failure)?.error === 'string';

// ── Anexos ─────────────────────────────────────────────────────

function checkFiles(files: UploadFile[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return `Envie no máximo ${MAX_ATTACHMENTS} arquivos por mensagem.`;
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) return `"${file.name}" passa de 10 MB.`;
    if (!ALLOWED_TYPES.test(file.type)) return `"${file.name}": envie imagem, PDF, texto, planilha, documento ou ZIP.`;
  }
  return null;
}

async function storeFiles(tenantId: string, ticketId: string, files: UploadFile[]): Promise<SupportAttachment[]> {
  const stored: SupportAttachment[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'arquivo';
    const path = `${tenantId}/${ticketId}/${randomUUID()}-${safeName}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file.buffer, { contentType: file.type });
    if (error) throw new Error(`Não foi possível enviar "${file.name}": ${error.message}`);
    stored.push({ path, name: file.name.slice(0, 120), size: file.size, type: file.type });
  }
  return stored;
}

async function signAttachments(messages: SupportMessage[]) {
  const paths = messages.flatMap((message) => message.attachments.map((file) => file.path));
  if (paths.length === 0) return;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const urls = new Map((data || []).map((item) => [item.path, item.signedUrl]));
  for (const message of messages) for (const file of message.attachments) file.url = urls.get(file.path) || undefined;
}

// ── Avisos ─────────────────────────────────────────────────────

const ticketLink = (id: string) => `/suporte?t=${id}`;

async function bell(userIds: (string | null | undefined)[], title: string, content: string, ticketId: string) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const { error } = await db.from('system_notifications').insert(ids.map((user_id) => ({ user_id, type: 'task', title, content: content.slice(0, 500), is_read: false, link: ticketLink(ticketId) })));
  if (error) console.error('[support] Falha ao avisar no sino:', error.message);
}

/** WhatsApp para o cliente, pelo WhatsApp da Vórtice. Nunca derruba a ação. */
async function whatsappCustomer(ticket: Row, text: string) {
  if (!ticket.notify_whatsapp || !ticket.contact_phone) return;
  try {
    const platform = await platformTenantId();
    if (!platform) return;
    const { whatsappChannels } = await import('@/services/conversations.service');
    const channels = await whatsappChannels(platform);
    const base = process.env.NEXT_PUBLIC_APP_URL ? `\n\nAcompanhe: ${process.env.NEXT_PUBLIC_APP_URL}${ticketLink(String(ticket.id))}` : '\n\nAcompanhe em *Chamados*, no vtec os.';
    const message = `🎫 *Chamado ${ticketLabel(Number(ticket.code))}* — ${String(ticket.subject).slice(0, 80)}\n\n${text.slice(0, 900)}${base}`;
    const phone = String(ticket.contact_phone);
    if (channels.web) {
      const { sendWhatsAppWebMessage } = await import('@/lib/whatsapp-web');
      await sendWhatsAppWebMessage(platform, phone, message);
    } else if (channels.api) {
      const { WhatsAppService, getWhatsAppConfig } = await import('@/lib/whatsapp');
      const service = new WhatsAppService(await getWhatsAppConfig(db, platform));
      const result = await service.sendText(phone.replace(/\D/g, ''), message);
      if (!result.success) throw new Error(result.error || 'A Meta recusou a mensagem.');
    }
  } catch (error) {
    console.error('[support] WhatsApp do chamado não enviado:', error instanceof Error ? error.message : error);
  }
}

/** Quem do atendimento recebe o aviso: o responsável ou, sem responsável, toda a equipe. */
async function notifyStaff(ticket: Row, title: string, content: string) {
  const targets = ticket.assigned_to ? [ticket.assigned_to as string] : (await supportTeam()).map((member) => member.id);
  await bell(targets, title, content, String(ticket.id));
}

async function notifyCustomer(ticket: Row, title: string, content: string, whatsappText: string) {
  await bell([ticket.opened_by as string], title, content, String(ticket.id));
  await whatsappCustomer(ticket, whatsappText);
}

async function addMessage(ticket: Row, values: { author_id: string | null; author_side: 'customer' | 'staff' | 'system'; body: string; internal?: boolean; attachments?: SupportAttachment[] }) {
  const { data, error } = await db
    .from('support_ticket_messages')
    .insert({ ticket_id: ticket.id, tenant_id: ticket.tenant_id, internal: false, attachments: [], ...values })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Row;
}

// ── Leitura ────────────────────────────────────────────────────

export interface ListFilters {
  view?: 'open' | 'active' | 'waiting' | 'done' | 'all';
  mine?: boolean;
  unassigned?: boolean;
  tenantId?: string;
  q?: string;
}

export async function listTickets(viewer: Viewer, filters: ListFilters = {}) {
  // tenant-scope: ok (atendimento da Vórtice vê os chamados de todas as empresas; o cliente é filtrado abaixo)
  let query = db.from('support_tickets').select('*');
  if (isStaff(viewer)) {
    if (filters.tenantId && /^[0-9a-f-]{36}$/i.test(filters.tenantId)) query = query.eq('tenant_id', filters.tenantId);
    if (filters.mine) query = query.eq('assigned_to', viewer.profile.id);
    if (filters.unassigned) query = query.is('assigned_to', null);
  } else {
    query = query.eq('tenant_id', viewer.tenantId);
    if (!isCompanyManager(viewer)) query = query.eq('opened_by', viewer.profile.id);
  }
  if (filters.view === 'open') query = query.in('status', OPEN_STATUSES);
  else if (filters.view === 'active') query = query.in('status', ['open', 'in_progress']);
  else if (filters.view === 'waiting') query = query.eq('status', 'waiting_customer');
  else if (filters.view === 'done') query = query.in('status', ['resolved', 'closed']);
  const term = (filters.q || '').trim();
  if (term) {
    const code = Number(term.replace('#', ''));
    query = Number.isInteger(code) && code > 0 ? query.eq('code', code) : query.ilike('subject', `%${term.replace(/[%_,()]/g, ' ')}%`);
  }

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Row[];
  const [names, tenants] = await Promise.all([
    namesOf(rows.flatMap((row) => [row.opened_by as string, row.assigned_to as string])),
    tenantNames(rows.map((row) => String(row.tenant_id))),
  ]);
  return rows.map((row) => summary(row, viewer, names, tenants));
}

/** Contadores das abas (só o que esta pessoa vê). */
export async function ticketCounts(viewer: Viewer) {
  // tenant-scope: ok (atendimento da Vórtice conta todas as empresas; o cliente é filtrado abaixo)
  let query = db.from('support_tickets').select('status, assigned_to, unread_by_staff, unread_by_customer');
  if (!isStaff(viewer)) {
    query = query.eq('tenant_id', viewer.tenantId);
    if (!isCompanyManager(viewer)) query = query.eq('opened_by', viewer.profile.id);
  }
  const { data } = await query.in('status', [...OPEN_STATUSES, 'resolved']);
  const rows = (data || []) as Row[];
  const staff = isStaff(viewer);
  return {
    open: rows.filter((row) => OPEN_STATUSES.includes(row.status as TicketStatus)).length,
    resolved: rows.filter((row) => row.status === 'resolved').length,
    active: rows.filter((row) => ['open', 'in_progress'].includes(String(row.status))).length,
    waiting: rows.filter((row) => row.status === 'waiting_customer').length,
    unassigned: staff ? rows.filter((row) => !row.assigned_to && ['open', 'in_progress'].includes(String(row.status))).length : 0,
    mine: staff ? rows.filter((row) => row.assigned_to === viewer.profile.id && OPEN_STATUSES.includes(row.status as TicketStatus)).length : 0,
    unread: rows.filter((row) => (staff ? row.unread_by_staff : row.unread_by_customer) === true).length,
  };
}

export async function getTicket(viewer: Viewer, id: string): Promise<SupportTicketDetail | Failure> {
  const ticket = await loadTicket(viewer, id);
  if (isFailure(ticket)) return ticket;
  const staff = isStaff(viewer);

  let messagesQuery = db.from('support_ticket_messages').select('*').eq('tenant_id', ticket.tenant_id as string).eq('ticket_id', id);
  if (!staff) messagesQuery = messagesQuery.eq('internal', false);
  const { data: messageRows } = await messagesQuery.order('created_at');
  const rows = (messageRows || []) as Row[];

  const [names, tenants] = await Promise.all([
    namesOf([ticket.opened_by as string, ticket.assigned_to as string, ...rows.map((row) => row.author_id as string)]),
    tenantNames([String(ticket.tenant_id)]),
  ]);

  const messages: SupportMessage[] = rows.map((row) => ({
    id: String(row.id),
    authorId: (row.author_id as string) || null,
    authorName: row.author_side === 'system' ? 'Sistema' : names.get(String(row.author_id))?.name || (row.author_side === 'staff' ? 'Equipe Vórtice' : 'Cliente'),
    side: row.author_side as SupportMessage['side'],
    body: String(row.body || ''),
    internal: row.internal === true,
    attachments: Array.isArray(row.attachments) ? (row.attachments as SupportAttachment[]) : [],
    createdAt: String(row.created_at),
  }));
  await signAttachments(messages);

  // Abriu o chamado: deixa de contar como não lido para este lado.
  const unreadKey = staff ? 'unread_by_staff' : 'unread_by_customer';
  if (ticket[unreadKey]) await db.from('support_tickets').update({ [unreadKey]: false }).eq('tenant_id', ticket.tenant_id as string).eq('id', id);

  return {
    ...summary(ticket, viewer, names, tenants),
    unread: false,
    contactPhone: (ticket.contact_phone as string) || null,
    notifyWhatsapp: ticket.notify_whatsapp === true,
    openedByEmail: names.get(String(ticket.opened_by))?.email || null,
    resolvedAt: (ticket.resolved_at as string) || null,
    closedAt: (ticket.closed_at as string) || null,
    rating: typeof ticket.rating === 'number' ? ticket.rating : null,
    ratingComment: (ticket.rating_comment as string) || null,
    messages,
  };
}

// ── Cliente abre ───────────────────────────────────────────────

const recentByUser = new Map<string, number[]>();

export async function createTicket(viewer: Viewer, body: Row, files: UploadFile[]): Promise<{ id: string; code: number } | Failure> {
  if (isStaff(viewer)) return { error: 'A equipe da Vórtice responde os chamados; quem abre são as empresas clientes.', status: 403 };
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 140) : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : '';
  if (!subject) return { error: 'Dê um título ao chamado.', status: 400 };
  if (message.length < 10) return { error: 'Descreva o que aconteceu (pelo menos 10 caracteres).', status: 400 };
  const category = CATEGORIES.includes(body.category as TicketCategory) ? (body.category as TicketCategory) : 'duvida';
  const priority = PRIORITIES.includes(body.priority as TicketPriority) ? (body.priority as TicketPriority) : 'normal';

  const notifyWhatsapp = body.notifyWhatsapp === true || body.notifyWhatsapp === 'true';
  const rawPhone = typeof body.phone === 'string' ? body.phone : '';
  if (notifyWhatsapp) {
    if (!rawPhone.trim()) return { error: 'Informe o WhatsApp para receber os avisos.', status: 400 };
    const invalid = validateBrazilPhone(rawPhone);
    if (invalid) return { error: invalid, status: 400 };
  }
  const fileError = checkFiles(files);
  if (fileError) return { error: fileError, status: 400 };

  const stamp = Date.now();
  const hits = (recentByUser.get(viewer.profile.id) || []).filter((at) => stamp - at < 3600_000);
  if (hits.length >= 10) return { error: 'Você abriu muitos chamados na última hora. Aguarde o retorno da equipe.', status: 429 };
  recentByUser.set(viewer.profile.id, [...hits, stamp]);

  const { data: ticket, error } = await db
    .from('support_tickets')
    .insert({
      tenant_id: viewer.tenantId,
      opened_by: viewer.profile.id,
      subject,
      category,
      priority,
      contact_phone: rawPhone.trim() ? normalizeBrazilPhone(rawPhone) : null,
      notify_whatsapp: notifyWhatsapp,
      last_customer_at: now(),
    })
    .select('*')
    .single();
  if (error || !ticket) return { error: error?.message || 'Não foi possível abrir o chamado.', status: 500 };

  try {
    const attachments = await storeFiles(viewer.tenantId, ticket.id, files);
    await addMessage(ticket, { author_id: viewer.profile.id, author_side: 'customer', body: message, attachments });
  } catch (failure) {
    await db.from('support_tickets').delete().eq('tenant_id', viewer.tenantId).eq('id', ticket.id);
    return { error: failure instanceof Error ? failure.message : 'Não foi possível abrir o chamado.', status: 500 };
  }

  await notifyStaff(
    ticket,
    `Novo chamado ${ticketLabel(ticket.code)}${priority === 'urgent' ? ' — URGENTE' : ''}`,
    `${viewer.profile.name} (${viewer.tenantName}): ${subject}`,
  );
  return { id: ticket.id, code: ticket.code };
}

// ── Conversa ───────────────────────────────────────────────────

export async function replyTicket(viewer: Viewer, id: string, body: Row, files: UploadFile[]): Promise<{ ok: true } | Failure> {
  const ticket = await loadTicket(viewer, id);
  if (isFailure(ticket)) return ticket;
  const staff = isStaff(viewer);
  const text = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : '';
  if (!text && files.length === 0) return { error: 'Escreva a mensagem.', status: 400 };
  const fileError = checkFiles(files);
  if (fileError) return { error: fileError, status: 400 };
  const internal = staff && (body.internal === true || body.internal === 'true');

  if (ticket.status === 'closed' && !staff) return { error: 'Este chamado foi encerrado. Abra um novo chamado.', status: 409 };

  let attachments: SupportAttachment[];
  try {
    attachments = await storeFiles(String(ticket.tenant_id), id, files);
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : 'Falha no anexo.', status: 500 };
  }
  await addMessage(ticket, { author_id: viewer.profile.id, author_side: staff ? 'staff' : 'customer', body: text, internal, attachments });

  const stamp = now();
  if (internal) {
    await db.from('support_tickets').update({ updated_at: stamp }).eq('tenant_id', ticket.tenant_id as string).eq('id', id);
    return { ok: true };
  }

  if (staff) {
    const requested = STATUSES.includes(body.status as TicketStatus) ? (body.status as TicketStatus) : null;
    const nextStatus: TicketStatus = requested || (ticket.status === 'open' ? 'in_progress' : (ticket.status as TicketStatus));
    const changes: Row = {
      status: nextStatus,
      last_staff_at: stamp,
      updated_at: stamp,
      unread_by_customer: true,
      ...(ticket.first_response_at ? {} : { first_response_at: stamp }),
      // Quem responde um chamado sem responsável assume.
      ...(ticket.assigned_to ? {} : { assigned_to: viewer.profile.id }),
      ...(nextStatus === 'resolved' && ticket.status !== 'resolved' ? { resolved_at: stamp } : {}),
      ...(nextStatus === 'closed' && ticket.status !== 'closed' ? { closed_at: stamp } : {}),
    };
    await db.from('support_tickets').update(changes).eq('tenant_id', ticket.tenant_id as string).eq('id', id);
    if (nextStatus !== ticket.status) {
      await addMessage(ticket, { author_id: viewer.profile.id, author_side: 'system', body: `Situação: ${STATUS_LABEL[nextStatus]}.` });
    }
    const statusNote = nextStatus !== ticket.status ? `\n\nSituação: *${STATUS_LABEL[nextStatus]}*` : '';
    await notifyCustomer(
      { ...ticket, ...changes },
      `Resposta no chamado ${ticketLabel(Number(ticket.code))}`,
      `${viewer.profile.name}: ${text || 'enviou um anexo.'}`,
      `*${viewer.profile.name} (Vórtice):*\n${text || '(enviou um anexo)'}${statusNote}`,
    );
    return { ok: true };
  }

  // Cliente respondeu: volta para a fila da Vórtice.
  const reopened = ['waiting_customer', 'resolved'].includes(String(ticket.status));
  const changes: Row = { last_customer_at: stamp, updated_at: stamp, unread_by_staff: true, ...(reopened ? { status: 'open', resolved_at: null } : {}) };
  await db.from('support_tickets').update(changes).eq('tenant_id', ticket.tenant_id as string).eq('id', id);
  if (ticket.status === 'resolved') {
    await addMessage(ticket, { author_id: viewer.profile.id, author_side: 'system', body: 'O cliente informou que ainda não resolveu. Chamado reaberto.' });
  }
  await notifyStaff(ticket, `Cliente respondeu o chamado ${ticketLabel(Number(ticket.code))}`, `${viewer.profile.name}: ${text || 'enviou um anexo.'}`);
  return { ok: true };
}

// ── Atendimento muda situação, prioridade, categoria e responsável ──

export async function updateTicket(viewer: Viewer, id: string, body: Row): Promise<{ ok: true } | Failure> {
  if (!isStaff(viewer)) return { error: 'Só a equipe de atendimento altera o chamado.', status: 403 };
  const ticket = await loadTicket(viewer, id);
  if (isFailure(ticket)) return ticket;
  const stamp = now();
  const changes: Row = {};
  const logs: string[] = [];

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as TicketStatus)) return { error: 'Situação inválida.', status: 400 };
    if (body.status !== ticket.status) {
      changes.status = body.status;
      if (body.status === 'resolved') changes.resolved_at = stamp;
      if (body.status === 'closed') changes.closed_at = stamp;
      if (OPEN_STATUSES.includes(body.status as TicketStatus)) Object.assign(changes, { resolved_at: null, closed_at: null });
      logs.push(`Situação: ${STATUS_LABEL[body.status as TicketStatus]}.`);
    }
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as TicketPriority)) return { error: 'Prioridade inválida.', status: 400 };
    if (body.priority !== ticket.priority) {
      changes.priority = body.priority;
      logs.push(`Prioridade: ${PRIORITY_LABEL[body.priority as TicketPriority]}.`);
    }
  }
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category as TicketCategory)) return { error: 'Categoria inválida.', status: 400 };
    if (body.category !== ticket.category) changes.category = body.category;
  }
  if (body.assignedTo !== undefined) {
    const assignee = typeof body.assignedTo === 'string' && body.assignedTo ? body.assignedTo : null;
    if (assignee && !(await supportTeam()).some((member) => member.id === assignee)) return { error: 'Escolha alguém da equipe de atendimento.', status: 400 };
    if (assignee !== (ticket.assigned_to || null)) {
      changes.assigned_to = assignee;
      const names = await namesOf([assignee]);
      logs.push(assignee ? `${names.get(assignee)?.name || 'Alguém'} assumiu o chamado.` : 'Chamado sem responsável.');
    }
  }
  if (Object.keys(changes).length === 0) return { ok: true };

  const statusChanged = changes.status !== undefined;
  await db
    .from('support_tickets')
    .update({ ...changes, updated_at: stamp, ...(statusChanged ? { unread_by_customer: true } : {}) })
    .eq('tenant_id', ticket.tenant_id as string)
    .eq('id', id);
  for (const log of logs) await addMessage(ticket, { author_id: viewer.profile.id, author_side: 'system', body: log });

  if (changes.assigned_to && changes.assigned_to !== viewer.profile.id) {
    await bell([changes.assigned_to as string], `Chamado ${ticketLabel(Number(ticket.code))} passado para você`, `${viewer.profile.name}: ${ticket.subject}`, id);
  }
  if (statusChanged) {
    const status = changes.status as TicketStatus;
    const hint = status === 'resolved' ? '\n\nSe resolveu, confirme no sistema. Se não, é só responder.' : status === 'waiting_customer' ? '\n\nPrecisamos de uma resposta sua para continuar.' : '';
    await notifyCustomer(
      { ...ticket, ...changes },
      `Chamado ${ticketLabel(Number(ticket.code))}: ${STATUS_LABEL[status]}`,
      String(ticket.subject),
      `Situação atualizada: *${STATUS_LABEL[status]}*${hint}`,
    );
  }
  return { ok: true };
}

/** Cliente confirma que resolveu (encerra e avalia). */
export async function confirmResolved(viewer: Viewer, id: string, body: Row): Promise<{ ok: true } | Failure> {
  if (isStaff(viewer)) return { error: 'Quem confirma é o cliente.', status: 403 };
  const ticket = await loadTicket(viewer, id);
  if (isFailure(ticket)) return ticket;
  if (ticket.status !== 'resolved') return { error: 'O chamado ainda não foi marcado como resolvido pela equipe.', status: 409 };
  const rating = Math.round(Number(body.rating));
  const validRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null;
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
  const stamp = now();
  await db
    .from('support_tickets')
    .update({ status: 'closed', closed_at: stamp, updated_at: stamp, rating: validRating, rating_comment: comment || null, unread_by_staff: true })
    .eq('tenant_id', ticket.tenant_id as string)
    .eq('id', id);
  await addMessage(ticket, {
    author_id: viewer.profile.id,
    author_side: 'system',
    body: `O cliente confirmou que resolveu.${validRating ? ` Avaliação: ${'★'.repeat(validRating)}${'☆'.repeat(5 - validRating)}` : ''}${comment ? ` — "${comment}"` : ''}`,
  });
  await notifyStaff(ticket, `Chamado ${ticketLabel(Number(ticket.code))} encerrado pelo cliente`, `${validRating ? `Nota ${validRating}/5. ` : ''}${comment}`);
  return { ok: true };
}
