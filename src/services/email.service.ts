/**
 * ============================================================
 * VTEC OS — Módulo E-mail (server-only)
 * ============================================================
 * Caixas da empresa (compartilhadas: quem tem a permissão E-mail vê;
 * administrador e gerente cadastram) e pessoais (só o dono vê e mexe).
 * A sincronização (src/lib/email/worker.ts) traz a Caixa de entrada de
 * cada caixa; aqui ficam ler, marcar, mover para a lixeira, enviar,
 * responder, encaminhar, modelos e anexos.
 * Excluir no sistema não apaga nada no servidor de e-mail.
 * ============================================================
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { openSecret, sealSecret } from '@/lib/secret-box';
import { checkMailHost } from '@/lib/email/host-guard';
import { sanitizeEmailHtml } from '@/lib/email/sanitize';
import {
  composeBodies,
  forwardSubject,
  isEmail,
  parseAddressList,
  replyReferences,
  replySubject,
  snippetOf,
  threadKeyFor,
  type EmailAddress,
} from '@/lib/email/format';
import { fetchNewMessages, markSeenOnServer, sendThroughServer, testMailServer, type IncomingMessage, type MailServer } from '@/lib/email/transport';
import type { TenantAuth } from '@/lib/session';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Fail = { ok: false; status: number; error: string };
type Result<T> = { ok: true; data: T } | Fail;

const BUCKET = 'email-attachments';
export const MAX_SEND_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_RECIPIENTS = 50;
const PAGE = 50;

const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const nowIso = () => new Date().toISOString();
const isManager = (auth: TenantAuth) => auth.profile.role === 'ADMIN' || auth.profile.role === 'MANAGER';

// ── Caixas ─────────────────────────────────────────────────────

export interface AccountView {
  id: string;
  kind: 'shared' | 'personal';
  name: string;
  emailAddress: string;
  fromName: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  signature: string;
  status: 'active' | 'error' | 'paused';
  lastError: string | null;
  lastSyncAt: string | null;
  unread: number;
  canManage: boolean;
}

const canSee = (account: Row, auth: TenantAuth) => account.tenant_id === auth.tenantId && (account.kind === 'shared' || account.owner_id === auth.profile.id);
const canManage = (account: Row, auth: TenantAuth) => (account.kind === 'shared' ? isManager(auth) : account.owner_id === auth.profile.id);

function toView(account: Row, auth: TenantAuth, unread = 0): AccountView {
  return {
    id: account.id,
    kind: account.kind,
    name: account.name,
    emailAddress: account.email_address,
    fromName: account.from_name,
    imapHost: account.imap_host,
    imapPort: account.imap_port,
    smtpHost: account.smtp_host,
    smtpPort: account.smtp_port,
    username: account.username,
    signature: account.signature,
    status: account.status,
    lastError: account.last_error,
    lastSyncAt: account.last_sync_at,
    unread,
    canManage: canManage(account, auth),
  };
}

async function visibleAccounts(auth: TenantAuth): Promise<Row[]> {
  const { data } = await db
    .from('email_accounts')
    .select('*')
    .eq('tenant_id', auth.tenantId)
    .or(`kind.eq.shared,owner_id.eq.${auth.profile.id}`)
    .order('kind', { ascending: false })
    .order('name');
  return (data || []) as Row[];
}

async function loadAccount(auth: TenantAuth, id: string): Promise<Row | null> {
  const { data } = await db.from('email_accounts').select('*').eq('tenant_id', auth.tenantId).eq('id', id).maybeSingle();
  return data && canSee(data, auth) ? (data as Row) : null;
}

export async function listAccounts(auth: TenantAuth): Promise<AccountView[]> {
  const accounts = await visibleAccounts(auth);
  const views: AccountView[] = [];
  for (const account of accounts) {
    const { count } = await db
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', auth.tenantId)
      .eq('account_id', account.id)
      .eq('folder', 'inbox')
      .eq('is_read', false);
    views.push(toView(account, auth, count || 0));
  }
  return views;
}

const serverOf = (account: Row, password: string): MailServer => ({
  imapHost: account.imap_host,
  imapPort: Number(account.imap_port),
  smtpHost: account.smtp_host,
  smtpPort: Number(account.smtp_port),
  username: account.username,
  password,
});

interface AccountInput {
  kind: 'shared' | 'personal';
  name: string;
  email_address: string;
  from_name: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  signature: string;
}

const port = (value: unknown, fallback: number) => {
  const parsed = Math.floor(Number(value));
  return parsed >= 1 && parsed <= 65535 ? parsed : fallback;
};

function cleanAccount(body: Row, current?: Row): { value: AccountInput } | { error: string } {
  const text = (key: string, max: number, fallback = '') => (typeof body[key] === 'string' ? body[key].trim().slice(0, max) : String(current?.[key] ?? fallback));
  const email = text('email_address', 160).toLowerCase();
  if (!isEmail(email)) return { error: 'Informe o e-mail da caixa (ex.: contato@suaempresa.com.br).' };
  const value: AccountInput = {
    kind: (current?.kind || (body.kind === 'personal' ? 'personal' : 'shared')) as 'shared' | 'personal',
    name: text('name', 60) || email,
    email_address: email,
    from_name: text('from_name', 80),
    imap_host: text('imap_host', 200).toLowerCase(),
    imap_port: port(body.imap_port ?? current?.imap_port, 993),
    smtp_host: text('smtp_host', 200).toLowerCase(),
    smtp_port: port(body.smtp_port ?? current?.smtp_port, 465),
    username: text('username', 160) || email,
    password: typeof body.password === 'string' ? body.password : '',
    signature: text('signature', 2000),
  };
  if (!value.imap_host) return { error: 'Informe o servidor de entrada (IMAP).' };
  if (!value.smtp_host) return { error: 'Informe o servidor de saída (SMTP).' };
  if (!current && !value.password) return { error: 'Informe a senha da caixa.' };
  return { value };
}

async function checkServers(input: AccountInput, password: string): Promise<string | null> {
  for (const host of [input.imap_host, input.smtp_host]) {
    const problem = await checkMailHost(host);
    if (problem) return problem;
  }
  const tested = await testMailServer({ imapHost: input.imap_host, imapPort: input.imap_port, smtpHost: input.smtp_host, smtpPort: input.smtp_port, username: input.username, password });
  return tested.ok ? null : tested.error;
}

export async function createAccount(auth: TenantAuth, body: Row): Promise<Result<AccountView>> {
  const cleaned = cleanAccount(body);
  if ('error' in cleaned) return fail(400, cleaned.error);
  const input = cleaned.value;
  if (input.kind === 'shared' && !isManager(auth)) return fail(403, 'Só administradores e gerentes cadastram caixas da empresa. Você pode conectar a sua caixa pessoal.');
  const problem = await checkServers(input, input.password);
  if (problem) return fail(400, problem);

  const { password, ...fields } = input;
  const { data, error } = await db
    .from('email_accounts')
    .insert({
      ...fields,
      tenant_id: auth.tenantId,
      owner_id: input.kind === 'personal' ? auth.profile.id : null,
      password_enc: sealSecret(password),
      status: 'active',
      created_by: auth.profile.id,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') return fail(409, 'Esta caixa já está conectada.');
    if (/email_accounts|schema cache|does not exist/.test(error.message)) return fail(500, 'Falta rodar a migration 202611090001_email_module.sql.');
    return fail(500, error.message);
  }
  // Primeiros e-mails já, sem esperar a próxima rodada.
  void syncAccount(data as Row).catch(() => {});
  return { ok: true, data: toView(data as Row, auth) };
}

export async function updateAccount(auth: TenantAuth, id: string, body: Row): Promise<Result<AccountView>> {
  const account = await loadAccount(auth, id);
  if (!account) return fail(404, 'Caixa não encontrada.');
  if (!canManage(account, auth)) return fail(403, 'Você não pode alterar esta caixa.');

  if (body.action === 'pause' || body.action === 'resume') {
    const status = body.action === 'pause' ? 'paused' : 'active';
    const { data } = await db.from('email_accounts').update({ status, last_error: null, updated_at: nowIso() }).eq('tenant_id', auth.tenantId).eq('id', id).select('*').single();
    return { ok: true, data: toView(data as Row, auth) };
  }

  const cleaned = cleanAccount(body, account);
  if ('error' in cleaned) return fail(400, cleaned.error);
  const input = cleaned.value;
  const serverChanged = ['imap_host', 'imap_port', 'smtp_host', 'smtp_port', 'username', 'email_address'].some((key) => String(input[key as keyof AccountInput]) !== String(account[key])) || Boolean(input.password);
  const changes: Row = {
    name: input.name,
    from_name: input.from_name,
    signature: input.signature,
    updated_at: nowIso(),
  };
  if (serverChanged) {
    const password = input.password || openSecret(account.password_enc);
    if (!password) return fail(400, 'Digite a senha da caixa de novo.');
    const problem = await checkServers(input, password);
    if (problem) return fail(400, problem);
    Object.assign(changes, {
      email_address: input.email_address,
      imap_host: input.imap_host,
      imap_port: input.imap_port,
      smtp_host: input.smtp_host,
      smtp_port: input.smtp_port,
      username: input.username,
      password_enc: sealSecret(password),
      status: 'active',
      last_error: null,
    });
  }
  const { data, error } = await db.from('email_accounts').update(changes).eq('tenant_id', auth.tenantId).eq('id', id).select('*').single();
  if (error) return fail(error.code === '23505' ? 409 : 500, error.code === '23505' ? 'Esta caixa já está conectada.' : error.message);
  return { ok: true, data: toView(data as Row, auth) };
}

async function removeFiles(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  }
}

const attachmentPaths = (rows: Row[]) => rows.flatMap((row) => ((row.attachments || []) as Row[]).map((item) => String(item.path || '')).filter(Boolean));

export async function deleteAccount(auth: TenantAuth, id: string): Promise<Result<true>> {
  const account = await loadAccount(auth, id);
  if (!account) return fail(404, 'Caixa não encontrada.');
  if (!canManage(account, auth)) return fail(403, 'Você não pode remover esta caixa.');
  const { data: rows } = await db.from('email_messages').select('attachments').eq('tenant_id', auth.tenantId).eq('account_id', id);
  await removeFiles(attachmentPaths((rows || []) as Row[])).catch(() => {});
  await db.from('email_accounts').delete().eq('tenant_id', auth.tenantId).eq('id', id);
  return { ok: true, data: true };
}

// ── Sincronização ──────────────────────────────────────────────

const safeName = (name: string) => name.normalize('NFD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'anexo';

async function uploadAttachments(tenantId: string, accountId: string, files: { filename: string; contentType: string; size: number; content: Buffer }[]) {
  const folder = `${tenantId}/${accountId}/${randomUUID()}`;
  const saved: Row[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      saved.push({ name: file.filename, type: file.contentType, size: file.size, path: null, skipped: true });
      continue;
    }
    const path = `${folder}/${index}-${safeName(file.filename)}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file.content, { contentType: file.contentType, upsert: false });
    saved.push({ name: file.filename, type: file.contentType, size: file.size, path: error ? null : path, skipped: Boolean(error) });
  }
  return saved;
}

async function threadKeyForIncoming(account: Row, message: IncomingMessage) {
  // Resposta a um e-mail que já temos: entra na mesma conversa dele.
  const parentIds = [message.inReplyTo, ...message.references].filter(Boolean) as string[];
  if (parentIds.length) {
    const { data } = await db
      .from('email_messages')
      .select('thread_key')
      .eq('tenant_id', account.tenant_id)
      .eq('account_id', account.id)
      .in('message_id', parentIds.slice(-10))
      .limit(1);
    if (data?.length) return String(data[0].thread_key);
  }
  return threadKeyFor({ messageId: message.messageId, inReplyTo: message.inReplyTo, references: message.references, subject: message.subject });
}

async function storeIncoming(account: Row, message: IncomingMessage): Promise<'saved' | 'duplicate'> {
  const attachments = message.attachments.length ? await uploadAttachments(account.tenant_id, account.id, message.attachments) : [];
  const { error } = await db.from('email_messages').insert({
    tenant_id: account.tenant_id,
    account_id: account.id,
    folder: 'inbox',
    direction: 'in',
    uid: message.uid,
    message_id: message.messageId,
    in_reply_to: message.inReplyTo,
    thread_key: await threadKeyForIncoming(account, message),
    from_name: message.from.name.slice(0, 200),
    from_address: message.from.address.slice(0, 200),
    to_list: message.to.slice(0, 100),
    cc_list: message.cc.slice(0, 100),
    reply_to: message.replyTo,
    subject: message.subject.slice(0, 500),
    snippet: snippetOf(message.text),
    body_text: message.text.slice(0, 200_000),
    body_html: message.html ? sanitizeEmailHtml(message.html).slice(0, 2_000_000) : null,
    attachments,
    sent_at: message.date,
    is_read: message.seen,
  });
  if (error) {
    if (error.code === '23505') {
      await removeFiles(attachmentPaths([{ attachments }])).catch(() => {});
      return 'duplicate';
    }
    throw new Error(error.message);
  }
  return 'saved';
}

async function notifyError(account: Row, message: string) {
  const userId = account.owner_id || account.created_by;
  if (!userId) return;
  await db.from('system_notifications').insert({
    user_id: userId,
    type: 'system',
    title: `A caixa ${account.email_address} parou de sincronizar`,
    content: `${message} Confira em E-mail > Caixas.`.slice(0, 500),
    is_read: false,
    link: '/email',
  });
}

/** Traz os e-mails novos de uma caixa. Usado pelo agendador e pelo botão "Atualizar". */
export async function syncAccount(account: Row, maxBatches = 3): Promise<{ saved: number; error?: string }> {
  const password = openSecret(account.password_enc);
  const markError = async (message: string) => {
    await db.from('email_accounts').update({ status: 'error', last_error: message, last_sync_at: nowIso(), updated_at: nowIso() }).eq('tenant_id', account.tenant_id).eq('id', account.id);
    if (account.status !== 'error') await notifyError(account, message).catch(() => {});
    return { saved: 0, error: message };
  };
  if (!password) return markError('A senha guardada não abre mais (a chave do sistema mudou). Edite a caixa e digite a senha de novo.');

  let saved = 0;
  let uidValidity = account.uid_validity == null ? null : String(account.uid_validity);
  let lastUid = Number(account.last_uid) || 0;
  try {
    for (let round = 0; round < maxBatches; round++) {
      const result = await fetchNewMessages(serverOf(account, password), { uidValidity, lastUid });
      for (const message of result.messages) {
        if ((await storeIncoming(account, message)) === 'saved') saved++;
      }
      uidValidity = result.uidValidity;
      lastUid = result.lastUid;
      await db
        .from('email_accounts')
        .update({ uid_validity: uidValidity, last_uid: lastUid, last_sync_at: nowIso(), status: 'active', last_error: null, updated_at: nowIso() })
        .eq('tenant_id', account.tenant_id)
        .eq('id', account.id);
      if (!result.more) break;
    }
  } catch (error) {
    const { emailErrorMessage } = await import('@/lib/email/errors');
    return markError(error instanceof Error && /^(O servidor|Servidor|Não foi|Problema|Erro no)/.test(error.message) ? error.message : emailErrorMessage(error, 'imap'));
  }
  return { saved };
}

export async function syncAccountNow(auth: TenantAuth, id: string): Promise<Result<{ saved: number }>> {
  const account = await loadAccount(auth, id);
  if (!account) return fail(404, 'Caixa não encontrada.');
  if (account.status === 'paused') return fail(400, 'Esta caixa está pausada. Retome para atualizar.');
  const result = await syncAccount(account);
  return result.error ? fail(502, result.error) : { ok: true, data: { saved: result.saved } };
}

// ── Mensagens ──────────────────────────────────────────────────

export type Folder = 'inbox' | 'sent' | 'trash' | 'starred';

export interface MessageItem {
  id: string;
  accountId: string;
  folder: string;
  direction: 'in' | 'out';
  fromName: string;
  fromAddress: string;
  to: EmailAddress[];
  subject: string;
  snippet: string;
  sentAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
}

const LIST_COLUMNS = 'id, account_id, folder, direction, from_name, from_address, to_list, subject, snippet, sent_at, is_read, is_starred, attachments';

const toItem = (row: Row): MessageItem => ({
  id: row.id,
  accountId: row.account_id,
  folder: row.folder,
  direction: row.direction,
  fromName: row.from_name,
  fromAddress: row.from_address,
  to: row.to_list || [],
  subject: row.subject,
  snippet: row.snippet,
  sentAt: row.sent_at,
  isRead: row.is_read,
  isStarred: row.is_starred,
  hasAttachments: Array.isArray(row.attachments) && row.attachments.length > 0,
});

export async function listMessages(auth: TenantAuth, query: { account?: string; folder?: string; q?: string; page?: number }): Promise<Result<{ items: MessageItem[]; total: number; page: number; pageSize: number }>> {
  const accounts = await visibleAccounts(auth);
  let ids = accounts.map((account) => String(account.id));
  if (query.account && query.account !== 'all') {
    if (!ids.includes(query.account)) return fail(404, 'Caixa não encontrada.');
    ids = [query.account];
  }
  const page = Math.max(0, Math.floor(Number(query.page) || 0));
  if (!ids.length) return { ok: true, data: { items: [], total: 0, page, pageSize: PAGE } };
  const folder = (['inbox', 'sent', 'trash', 'starred'].includes(String(query.folder)) ? query.folder : 'inbox') as Folder;

  let request = db.from('email_messages').select(LIST_COLUMNS, { count: 'exact' }).eq('tenant_id', auth.tenantId).in('account_id', ids);
  request = folder === 'starred' ? request.eq('is_starred', true).neq('folder', 'trash') : request.eq('folder', folder);
  const q = String(query.q || '').replace(/[%,()*\\]/g, ' ').trim().slice(0, 100);
  if (q) request = request.or(`subject.ilike.%${q}%,from_address.ilike.%${q}%,from_name.ilike.%${q}%,snippet.ilike.%${q}%`);
  const { data, count, error } = await request.order('sent_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) return fail(500, error.message);
  return { ok: true, data: { items: ((data || []) as Row[]).map(toItem), total: count || 0, page, pageSize: PAGE } };
}

export interface MessageFull extends MessageItem {
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: string | null;
  bodyText: string;
  bodyHtml: string | null;
  attachments: { index: number; name: string; type: string; size: number; available: boolean }[];
  sentByName: string | null;
}

async function loadMessage(auth: TenantAuth, id: string): Promise<{ message: Row; account: Row } | null> {
  const { data: message } = await db.from('email_messages').select('*').eq('tenant_id', auth.tenantId).eq('id', id).maybeSingle();
  if (!message) return null;
  const account = await loadAccount(auth, String(message.account_id));
  return account ? { message: message as Row, account } : null;
}

export async function getThread(auth: TenantAuth, id: string): Promise<Result<{ account: AccountView; messages: MessageFull[]; openedId: string }>> {
  const loaded = await loadMessage(auth, id);
  if (!loaded) return fail(404, 'E-mail não encontrado.');
  const { message, account } = loaded;
  let request = db.from('email_messages').select('*').eq('tenant_id', auth.tenantId).eq('account_id', account.id).eq('thread_key', message.thread_key);
  if (message.folder !== 'trash') request = request.neq('folder', 'trash');
  const { data } = await request.order('sent_at', { ascending: true }).limit(100);
  const rows = ((data || []) as Row[]).length ? (data as Row[]) : [message];

  // Abriu: marca como lido aqui e no servidor.
  const unread = rows.filter((row) => !row.is_read);
  if (unread.length) {
    await db.from('email_messages').update({ is_read: true }).eq('tenant_id', auth.tenantId).in('id', unread.map((row) => row.id));
    const uids = unread.filter((row) => row.direction === 'in' && row.uid).map((row) => Number(row.uid));
    const password = openSecret(account.password_enc);
    if (uids.length && password) void markSeenOnServer(serverOf(account, password), uids);
  }

  const senderIds = [...new Set(rows.map((row) => row.sent_by).filter(Boolean))];
  const names = new Map<string, string>();
  if (senderIds.length) {
    const { data: people } = await db.from('profiles').select('id, name').eq('tenant_id', auth.tenantId).in('id', senderIds);
    for (const person of (people || []) as Row[]) names.set(String(person.id), String(person.name));
  }

  return {
    ok: true,
    data: {
      account: toView(account, auth),
      openedId: message.id,
      messages: rows.map((row) => ({
        ...toItem({ ...row, is_read: true }),
        cc: row.cc_list || [],
        bcc: row.direction === 'out' ? row.bcc_list || [] : [],
        replyTo: row.reply_to,
        bodyText: row.body_text,
        bodyHtml: row.body_html,
        attachments: ((row.attachments || []) as Row[]).map((item, index) => ({ index, name: String(item.name), type: String(item.type), size: Number(item.size) || 0, available: Boolean(item.path) })),
        sentByName: row.sent_by ? names.get(String(row.sent_by)) || null : null,
      })),
    },
  };
}

export async function updateMessages(auth: TenantAuth, body: Row): Promise<Result<{ updated: number }>> {
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((id: unknown): id is string => typeof id === 'string').slice(0, 200);
  const action = String(body.action || '');
  if (!ids.length) return fail(400, 'Escolha pelo menos um e-mail.');
  const visible = new Set((await visibleAccounts(auth)).map((account) => String(account.id)));
  const { data } = await db.from('email_messages').select('id, account_id, folder, direction, attachments').eq('tenant_id', auth.tenantId).in('id', ids);
  const rows = ((data || []) as Row[]).filter((row) => visible.has(String(row.account_id)));
  if (!rows.length) return fail(404, 'E-mail não encontrado.');
  const rowIds = rows.map((row) => row.id);
  const update = (changes: Row, only = rowIds) => db.from('email_messages').update(changes).eq('tenant_id', auth.tenantId).in('id', only);

  switch (action) {
    case 'read':
    case 'unread':
      await update({ is_read: action === 'read' });
      break;
    case 'star':
    case 'unstar':
      await update({ is_starred: action === 'star' });
      break;
    case 'trash':
      await update({ folder: 'trash' });
      break;
    case 'restore': {
      const incoming = rows.filter((row) => row.direction === 'in').map((row) => row.id);
      const outgoing = rows.filter((row) => row.direction === 'out').map((row) => row.id);
      if (incoming.length) await update({ folder: 'inbox' }, incoming);
      if (outgoing.length) await update({ folder: 'sent' }, outgoing);
      break;
    }
    case 'delete': {
      const inTrash = rows.filter((row) => row.folder === 'trash');
      if (!inTrash.length) return fail(400, 'Só dá para excluir de vez o que está na lixeira.');
      await removeFiles(attachmentPaths(inTrash)).catch(() => {});
      await db.from('email_messages').delete().eq('tenant_id', auth.tenantId).in('id', inTrash.map((row) => row.id));
      return { ok: true, data: { updated: inTrash.length } };
    }
    default:
      return fail(400, 'Ação desconhecida.');
  }
  return { ok: true, data: { updated: rows.length } };
}

export async function getAttachment(auth: TenantAuth, messageId: string, index: number): Promise<Result<{ name: string; type: string; content: Buffer }>> {
  const loaded = await loadMessage(auth, messageId);
  if (!loaded) return fail(404, 'E-mail não encontrado.');
  const item = ((loaded.message.attachments || []) as Row[])[index];
  if (!item?.path) return fail(404, 'Anexo indisponível.');
  const { data, error } = await db.storage.from(BUCKET).download(String(item.path));
  if (error || !data) return fail(404, 'Anexo indisponível.');
  return { ok: true, data: { name: String(item.name), type: String(item.type), content: Buffer.from(await data.arrayBuffer()) } };
}

// ── Enviar, responder, encaminhar ──────────────────────────────

export interface SendFile {
  name: string;
  type: string;
  content: Buffer;
}

export async function sendEmail(auth: TenantAuth, body: Row, files: SendFile[] = []): Promise<Result<{ id: string }>> {
  const account = await loadAccount(auth, String(body.accountId || ''));
  if (!account) return fail(404, 'Escolha a caixa que vai enviar.');
  const password = openSecret(account.password_enc);
  if (!password) return fail(400, 'A senha desta caixa precisa ser digitada de novo (E-mail > Caixas > Editar).');

  const to = parseAddressList(String(body.to || ''));
  const cc = parseAddressList(String(body.cc || ''));
  const bcc = parseAddressList(String(body.bcc || ''));
  const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid];
  if (invalid.length) return fail(400, `Endereço inválido: ${invalid.slice(0, 3).join(', ')}`);
  if (!to.list.length) return fail(400, 'Informe para quem vai o e-mail.');
  if (to.list.length + cc.list.length + bcc.list.length > MAX_RECIPIENTS) return fail(400, `No máximo ${MAX_RECIPIENTS} destinatários por e-mail. Para mais, use os Disparos.`);
  const subject = String(body.subject || '').trim().slice(0, 300);
  const text = String(body.body || '').slice(0, 100_000);
  if (!subject && !text.trim()) return fail(400, 'Escreva o assunto ou a mensagem.');

  // Resposta ou encaminhamento: precisa ser da mesma caixa.
  let parent: Row | null = null;
  const mode = body.mode === 'forward' ? 'forward' : body.mode === 'reply' ? 'reply' : null;
  if (mode && body.parentId) {
    const loaded = await loadMessage(auth, String(body.parentId));
    if (!loaded || loaded.account.id !== account.id) return fail(404, 'E-mail original não encontrado nesta caixa.');
    parent = loaded.message;
  }

  const attachments = files.map((file) => ({ filename: file.name.slice(0, 200), contentType: file.type || 'application/octet-stream', content: file.content }));
  if (parent && mode === 'forward' && body.keepAttachments !== false && body.keepAttachments !== 'false') {
    for (const item of (parent.attachments || []) as Row[]) {
      if (!item.path) continue;
      const { data } = await db.storage.from(BUCKET).download(String(item.path));
      if (data) attachments.push({ filename: String(item.name), contentType: String(item.type), content: Buffer.from(await data.arrayBuffer()) });
    }
  }
  const totalBytes = attachments.reduce((sum, item) => sum + item.content.length, 0);
  if (totalBytes > MAX_SEND_BYTES) return fail(400, 'Os anexos passam de 20 MB. Mande um link ou divida em mais e-mails.');

  const quoted = parent
    ? { fromName: parent.from_name, fromAddress: parent.from_address, sentAt: parent.sent_at, bodyText: parent.body_text, bodyHtml: parent.body_html, subject: parent.subject, to: parent.to_list || [] }
    : null;
  const bodies = composeBodies({ body: text, signature: account.signature, quoted, mode: mode || undefined });
  const finalSubject = subject || (parent ? (mode === 'forward' ? forwardSubject(parent.subject) : replySubject(parent.subject)) : '(sem assunto)');
  const isReply = parent && mode === 'reply';

  let messageId: string;
  try {
    ({ messageId } = await sendThroughServer(serverOf(account, password), {
      fromName: account.from_name || auth.tenantName,
      fromAddress: account.email_address,
      to: to.list,
      cc: cc.list,
      bcc: bcc.list,
      subject: finalSubject,
      text: bodies.text,
      html: bodies.html,
      inReplyTo: isReply ? parent!.message_id : null,
      references: isReply ? replyReferences(String(parent!.thread_key), parent!.message_id) : null,
      attachments,
    }));
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : 'Não foi possível enviar.');
  }

  const saved = attachments.length ? await uploadAttachments(auth.tenantId, account.id, attachments.map((item) => ({ filename: item.filename, contentType: item.contentType, size: item.content.length, content: item.content }))) : [];
  const { data, error } = await db
    .from('email_messages')
    .insert({
      tenant_id: auth.tenantId,
      account_id: account.id,
      folder: 'sent',
      direction: 'out',
      message_id: messageId,
      in_reply_to: isReply ? parent!.message_id : null,
      thread_key: isReply ? parent!.thread_key : messageId,
      from_name: account.from_name || auth.tenantName,
      from_address: account.email_address,
      to_list: to.list,
      cc_list: cc.list,
      bcc_list: bcc.list,
      subject: finalSubject,
      snippet: snippetOf(text),
      body_text: bodies.text.slice(0, 200_000),
      body_html: bodies.html.slice(0, 2_000_000),
      attachments: saved,
      sent_at: nowIso(),
      is_read: true,
      sent_by: auth.profile.id,
    })
    .select('id')
    .single();
  if (error) return fail(500, `O e-mail foi enviado, mas não ficou salvo no sistema: ${error.message}`);
  return { ok: true, data: { id: String(data.id) } };
}

// ── Modelos ────────────────────────────────────────────────────

export interface TemplateView {
  id: string;
  name: string;
  subject: string;
  body: string;
  canEdit: boolean;
}

export async function listTemplates(auth: TenantAuth): Promise<TemplateView[]> {
  const { data } = await db.from('email_templates').select('*').eq('tenant_id', auth.tenantId).order('name');
  return ((data || []) as Row[]).map((row) => ({ id: row.id, name: row.name, subject: row.subject, body: row.body, canEdit: isManager(auth) || row.created_by === auth.profile.id }));
}

export async function saveTemplate(auth: TenantAuth, body: Row): Promise<Result<TemplateView>> {
  const name = String(body.name || '').trim().slice(0, 80);
  const subject = String(body.subject || '').trim().slice(0, 300);
  const text = String(body.body || '').slice(0, 20_000);
  if (!name) return fail(400, 'Dê um nome ao modelo.');
  if (!text.trim()) return fail(400, 'Escreva o texto do modelo.');
  if (body.id) {
    const { data: current } = await db.from('email_templates').select('*').eq('tenant_id', auth.tenantId).eq('id', String(body.id)).maybeSingle();
    if (!current) return fail(404, 'Modelo não encontrado.');
    if (!isManager(auth) && current.created_by !== auth.profile.id) return fail(403, 'Só quem criou (ou um gerente) altera este modelo.');
    const { data } = await db.from('email_templates').update({ name, subject, body: text, updated_at: nowIso() }).eq('tenant_id', auth.tenantId).eq('id', current.id).select('*').single();
    return { ok: true, data: { id: data!.id, name, subject, body: text, canEdit: true } };
  }
  const { data, error } = await db.from('email_templates').insert({ tenant_id: auth.tenantId, name, subject, body: text, created_by: auth.profile.id }).select('*').single();
  if (error) return fail(500, error.message);
  return { ok: true, data: { id: data.id, name, subject, body: text, canEdit: true } };
}

export async function deleteTemplate(auth: TenantAuth, id: string): Promise<Result<true>> {
  const { data: current } = await db.from('email_templates').select('*').eq('tenant_id', auth.tenantId).eq('id', id).maybeSingle();
  if (!current) return fail(404, 'Modelo não encontrado.');
  if (!isManager(auth) && current.created_by !== auth.profile.id) return fail(403, 'Só quem criou (ou um gerente) apaga este modelo.');
  await db.from('email_templates').delete().eq('tenant_id', auth.tenantId).eq('id', id);
  return { ok: true, data: true };
}
