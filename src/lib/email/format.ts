/**
 * ============================================================
 * VTEC OS — E-mail: regras puras (endereços, assunto, conversa, corpo)
 * ============================================================
 * Sem banco e sem rede: usado no servidor e na tela, e coberto pelos
 * testes (tests/email.test.ts).
 * ============================================================
 */

export interface EmailAddress {
  name: string;
  address: string;
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export const isEmail = (value: string) => EMAIL_RE.test(value.trim());

/** Separa por vírgula, ponto e vírgula ou linha, sem quebrar "Lima, Carlos" <c@z.com>. */
function splitRecipients(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let angle = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (char === '<' && !quoted) angle = true;
    else if (char === '>' && !quoted) angle = false;
    if (!quoted && !angle && (char === ',' || char === ';' || char === '\n')) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/**
 * "Ana <ana@x.com>, bia@y.com; Carlos Lima <c@z.com>" → lista de endereços.
 * O que não for e-mail volta em `invalid` (para avisar quem digitou).
 */
export function parseAddressList(input: string): { list: EmailAddress[]; invalid: string[] } {
  const list: EmailAddress[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of splitRecipients(String(input || ''))) {
    const part = raw.trim();
    if (!part) continue;
    const match = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    const name = match ? match[1].trim() : '';
    const address = (match ? match[2] : part).trim().toLowerCase();
    if (!isEmail(address)) {
      invalid.push(part);
      continue;
    }
    if (seen.has(address)) continue;
    seen.add(address);
    list.push({ name, address });
  }
  return { list, invalid };
}

export function formatAddress(item: EmailAddress) {
  if (!item.name || item.name.toLowerCase() === item.address.toLowerCase()) return item.address;
  return `"${item.name.replace(/"/g, "'")}" <${item.address}>`;
}

export const formatAddressList = (items: EmailAddress[]) => items.map(formatAddress).join(', ');

/** Nome para mostrar: o nome, ou a parte antes do @. */
export const displayName = (item: EmailAddress) => item.name || item.address.split('@')[0];

// ── Assunto ────────────────────────────────────────────────────

const PREFIX_RE = /^\s*((re|res|enc|fw|fwd|tr)\s*(\[\d+\])?\s*:\s*)+/i;

/** Assunto sem "Re:", "Res:", "Enc:", "Fwd:" repetidos. */
export const baseSubject = (subject: string) => String(subject || '').replace(PREFIX_RE, '').trim();

export function replySubject(subject: string) {
  const base = baseSubject(subject);
  return base ? `Re: ${base}` : 'Re: (sem assunto)';
}

export function forwardSubject(subject: string) {
  const base = baseSubject(subject);
  return base ? `Enc: ${base}` : 'Enc: (sem assunto)';
}

// ── Conversa (thread) ──────────────────────────────────────────

/** "<a@b> <c@d>" → ['<a@b>', '<c@d>'] */
export function messageIds(value: string | string[] | null | undefined): string[] {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  return text.match(/<[^<>\s]+>/g) || [];
}

/**
 * Chave da conversa: o primeiro Message-ID da corrente (References), ou a
 * mensagem respondida, ou a própria mensagem. Assim a resposta cai na
 * mesma conversa da original, dos dois lados.
 */
export function threadKeyFor(input: { messageId?: string | null; inReplyTo?: string | null; references?: string | string[] | null; subject?: string | null }) {
  const refs = messageIds(input.references);
  if (refs.length) return refs[0];
  const parent = messageIds(input.inReplyTo);
  if (parent.length) return parent[0];
  const own = messageIds(input.messageId);
  if (own.length) return own[0];
  return `subject:${baseSubject(input.subject || '').toLowerCase().slice(0, 200)}`;
}

/** References de uma resposta: a corrente até aqui + a mensagem respondida. */
export function replyReferences(threadKey: string, parentMessageId: string | null | undefined) {
  const ids = [...messageIds(threadKey), ...messageIds(parentMessageId)];
  return [...new Set(ids)].join(' ');
}

// ── Corpo ──────────────────────────────────────────────────────

export function snippetOf(text: string, max = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export const escapeHtml = (text: string) =>
  String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto digitado → HTML simples (quebras de linha e links clicáveis). */
export function textToHtml(text: string) {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
    .replace(/\r?\n/g, '<br>');
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export interface QuotedMessage {
  fromName: string;
  fromAddress: string;
  sentAt: string;
  bodyText: string;
  bodyHtml?: string | null;
  subject?: string;
  to?: EmailAddress[];
}

/** Monta texto e HTML de um e-mail: corpo + assinatura + mensagem citada (resposta ou encaminhamento). */
export function composeBodies(input: { body: string; signature?: string; quoted?: QuotedMessage | null; mode?: 'reply' | 'forward' }) {
  const signature = String(input.signature || '').trim();
  let text = String(input.body || '').trim();
  let html = `<div>${textToHtml(text)}</div>`;
  if (signature) {
    text += `\n\n-- \n${signature}`;
    html += `<br><div style="color:#555">-- <br>${textToHtml(signature)}</div>`;
  }
  const q = input.quoted;
  if (q) {
    const who = q.fromName ? `${q.fromName} <${q.fromAddress}>` : q.fromAddress;
    if (input.mode === 'forward') {
      const header = ['---------- Mensagem encaminhada ----------', `De: ${who}`, `Data: ${dateLabel(q.sentAt)}`, `Assunto: ${q.subject || ''}`, q.to?.length ? `Para: ${formatAddressList(q.to)}` : ''].filter(Boolean);
      text += `\n\n${header.join('\n')}\n\n${q.bodyText}`;
      html += `<br><br><div>${header.map(escapeHtml).join('<br>')}</div><br>${q.bodyHtml || textToHtml(q.bodyText)}`;
    } else {
      const intro = `Em ${dateLabel(q.sentAt)}, ${who} escreveu:`;
      text += `\n\n${intro}\n${q.bodyText.split(/\r?\n/).map((line) => `> ${line}`).join('\n')}`;
      html += `<br><br><div>${escapeHtml(intro)}</div><blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${q.bodyHtml || textToHtml(q.bodyText)}</blockquote>`;
    }
  }
  return { text, html };
}

/** Responder a todos: remetente + destinatários, sem a própria caixa e sem repetir. */
export function replyAllRecipients(input: { from: EmailAddress; replyTo?: string | null; to: EmailAddress[]; cc: EmailAddress[]; own: string }) {
  const own = input.own.toLowerCase();
  const first = input.replyTo && isEmail(input.replyTo) ? [{ name: '', address: input.replyTo.toLowerCase() }] : [input.from];
  const to = first.filter((item) => item.address.toLowerCase() !== own);
  const seen = new Set([own, ...to.map((item) => item.address.toLowerCase())]);
  const cc: EmailAddress[] = [];
  for (const item of [...input.to, ...input.cc]) {
    const address = item.address.toLowerCase();
    if (seen.has(address)) continue;
    seen.add(address);
    cc.push(item);
  }
  return { to, cc };
}

export const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
