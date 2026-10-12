/**
 * ============================================================
 * VTEC OS — E-mail: conversa com o servidor (server-only)
 * ============================================================
 * IMAP para receber (só a Caixa de entrada), SMTP para enviar e, depois
 * de enviar, guarda uma cópia na pasta "Enviados" do próprio servidor
 * (o e-mail aparece também no webmail/celular). Nada aqui apaga
 * mensagens no servidor.
 * ============================================================
 */

import { ImapFlow, type ListResponse } from 'imapflow';
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { emailErrorMessage } from '@/lib/email/errors';
import { secureForPort } from '@/lib/email/presets';
import type { EmailAddress } from '@/lib/email/format';

export interface MailServer {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
}

/** Maior e-mail que baixamos (o resto fica só no servidor, com aviso). */
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
/** Quantos e-mails por caixa em cada rodada (os próximos vêm na seguinte). */
export const BATCH_SIZE = 40;
/** Primeira conexão: só os e-mails destes últimos dias. */
export const FIRST_SYNC_DAYS = 14;

function imapClient(server: MailServer) {
  return new ImapFlow({
    host: server.imapHost,
    port: server.imapPort,
    secure: secureForPort(server.imapPort),
    auth: { user: server.username, pass: server.password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

function smtpTransport(server: MailServer) {
  return nodemailer.createTransport({
    host: server.smtpHost,
    port: server.smtpPort,
    secure: secureForPort(server.smtpPort),
    auth: { user: server.username, pass: server.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

async function closeQuietly(client: ImapFlow) {
  await client.logout().catch(() => client.close());
}

/** Testa entrada e saída antes de salvar a caixa. */
export async function testMailServer(server: MailServer): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = imapClient(server);
  client.on('error', () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
  } catch (error) {
    return { ok: false, error: emailErrorMessage(error, 'imap') };
  } finally {
    await closeQuietly(client);
  }
  try {
    await smtpTransport(server).verify();
  } catch (error) {
    return { ok: false, error: emailErrorMessage(error, 'smtp') };
  }
  return { ok: true };
}

export interface IncomingAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
}

export interface IncomingMessage {
  uid: number;
  seen: boolean;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  replyTo: string | null;
  date: string;
  text: string;
  html: string | null;
  attachments: IncomingAttachment[];
  /** Grande demais para baixar: só o aviso. */
  tooLarge?: boolean;
}

const addresses = (value: AddressObject | AddressObject[] | undefined): EmailAddress[] =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((group) => group.value)
    .filter((item) => item.address)
    .map((item) => ({ name: (item.name || '').trim(), address: String(item.address).toLowerCase() }));

const INLINE_MAX = 400 * 1024;

/** Imagens dentro do texto (cid:) viram data: para aparecer sem baixar nada; o resto vira anexo. */
function splitParsed(parsed: ParsedMail): { html: string | null; attachments: IncomingAttachment[] } {
  let html = typeof parsed.html === 'string' ? parsed.html : null;
  const attachments: IncomingAttachment[] = [];
  for (const item of parsed.attachments || []) {
    const inline = item.contentDisposition === 'inline' || Boolean(item.related);
    if (inline && item.cid && html && html.includes(`cid:${item.cid}`) && item.size <= INLINE_MAX && /^image\//.test(item.contentType)) {
      html = html.split(`cid:${item.cid}`).join(`data:${item.contentType};base64,${item.content.toString('base64')}`);
      continue;
    }
    attachments.push({ filename: item.filename || 'anexo', contentType: item.contentType || 'application/octet-stream', size: item.size || item.content.length, content: item.content });
  }
  return { html, attachments };
}

function toIncoming(uid: number, seen: boolean, parsed: ParsedMail): IncomingMessage {
  const from = addresses(parsed.from)[0] || { name: '', address: '' };
  const { html, attachments } = splitParsed(parsed);
  const refs = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
  return {
    uid,
    seen,
    messageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo || null,
    references: refs,
    subject: parsed.subject || '',
    from,
    to: addresses(parsed.to),
    cc: addresses(parsed.cc),
    replyTo: addresses(parsed.replyTo)[0]?.address || null,
    date: (parsed.date || new Date()).toISOString(),
    text: parsed.text || '',
    html,
    attachments,
  };
}

/**
 * Busca e-mails novos da Caixa de entrada (UID maior que o último visto).
 * UIDVALIDITY diferente = a caixa foi recriada no servidor: recomeça.
 */
export async function fetchNewMessages(server: MailServer, state: { uidValidity: string | null; lastUid: number }): Promise<{ uidValidity: string; lastUid: number; messages: IncomingMessage[]; more: boolean }> {
  const client = imapClient(server);
  client.on('error', () => {});
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error('Caixa de entrada não abriu.');
      const uidValidity = String(mailbox.uidValidity);
      const restart = state.uidValidity !== uidValidity;
      const lastUid = restart ? 0 : state.lastUid;

      let uids: number[];
      if (lastUid > 0) {
        uids = ((await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || []).filter((uid) => uid > lastUid);
      } else {
        const since = new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000);
        uids = (await client.search({ since }, { uid: true })) || [];
      }
      uids.sort((a, b) => a - b);
      const batch = uids.slice(0, BATCH_SIZE);
      const messages: IncomingMessage[] = [];
      if (batch.length) {
        const meta = await client.fetchAll(batch.join(','), { uid: true, flags: true, size: true, envelope: true }, { uid: true });
        for (const item of meta.sort((a, b) => a.uid - b.uid)) {
          const seen = Boolean(item.flags?.has('\\Seen'));
          if ((item.size || 0) > MAX_MESSAGE_BYTES) {
            const env = item.envelope;
            const sender = env?.from?.[0];
            messages.push({
              uid: item.uid, seen, messageId: env?.messageId || null, inReplyTo: env?.inReplyTo || null, references: [],
              subject: env?.subject || '', from: { name: sender?.name || '', address: (sender?.address || '').toLowerCase() },
              to: (env?.to || []).filter((a) => a.address).map((a) => ({ name: a.name || '', address: String(a.address).toLowerCase() })),
              cc: [], replyTo: null, date: new Date(env?.date || Date.now()).toISOString(),
              text: 'Este e-mail é grande demais para abrir no sistema (mais de 25 MB). Abra no seu provedor de e-mail.', html: null, attachments: [], tooLarge: true,
            });
            continue;
          }
          const full = await client.fetchOne(String(item.uid), { uid: true, source: true }, { uid: true });
          if (!full || !full.source) continue;
          messages.push(toIncoming(item.uid, seen, await simpleParser(full.source)));
        }
      }
      const newLast = batch.length ? Math.max(lastUid, ...batch) : lastUid;
      return { uidValidity, lastUid: newLast, messages, more: uids.length > batch.length };
    } finally {
      lock.release();
    }
  } finally {
    await closeQuietly(client);
  }
}

/** Marca como lido no servidor (quando alguém abre no sistema). Silencioso se falhar. */
export async function markSeenOnServer(server: MailServer, uids: number[]) {
  if (!uids.length) return;
  const client = imapClient(server);
  client.on('error', () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      await client.messageFlagsAdd(uids.join(','), ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  } catch {
    // Só uma gentileza com o webmail: o sistema já marcou como lido.
  } finally {
    await closeQuietly(client);
  }
}

const SENT_NAMES = ['sent', 'sent items', 'sent messages', 'enviados', 'itens enviados', 'mensagens enviadas', 'inbox.sent', 'inbox.enviados'];

function sentFolder(list: ListResponse[]) {
  return list.find((box) => box.specialUse === '\\Sent') || list.find((box) => SENT_NAMES.includes(box.path.toLowerCase()));
}

export interface OutgoingMessage {
  fromName: string;
  fromAddress: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments: { filename: string; contentType: string; content: Buffer }[];
}

const asNodemailer = (list: EmailAddress[]) => list.map((item) => (item.name ? { name: item.name, address: item.address } : item.address));

/** Envia e devolve o Message-ID. A cópia em "Enviados" é tentativa: se falhar, o e-mail já saiu. */
export async function sendThroughServer(server: MailServer, message: OutgoingMessage): Promise<{ messageId: string }> {
  const domain = message.fromAddress.split('@')[1] || 'vtecos.local';
  const messageId = `<${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}@${domain}>`;
  const mail = {
    from: message.fromName ? { name: message.fromName, address: message.fromAddress } : message.fromAddress,
    to: asNodemailer(message.to),
    cc: asNodemailer(message.cc),
    bcc: asNodemailer(message.bcc),
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageId,
    inReplyTo: message.inReplyTo || undefined,
    references: message.references || undefined,
    attachments: message.attachments.map((item) => ({ filename: item.filename, contentType: item.contentType, content: item.content })),
  };
  try {
    await smtpTransport(server).sendMail(mail);
  } catch (error) {
    throw new Error(emailErrorMessage(error, 'smtp'));
  }

  // O Gmail já guarda sozinho o que sai pelo SMTP dele.
  if (!/gmail\.com$|googlemail\.com$/i.test(server.smtpHost)) {
    const client = imapClient(server);
    client.on('error', () => {});
    try {
      const raw = await new MailComposer({ ...mail, bcc: undefined }).compile().build();
      await client.connect();
      const folder = sentFolder(await client.list());
      if (folder) await client.append(folder.path, raw, ['\\Seen']);
    } catch {
      // Sem cópia em "Enviados" no servidor; no sistema ela aparece.
    } finally {
      await closeQuietly(client);
    }
  }
  return { messageId };
}
