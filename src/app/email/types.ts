import type { EmailAddress } from '@/lib/email/format';

export type Folder = 'inbox' | 'sent' | 'starred' | 'trash';

export interface Account {
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

export interface MessageFull extends MessageItem {
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: string | null;
  bodyText: string;
  bodyHtml: string | null;
  attachments: { index: number; name: string; type: string; size: number; available: boolean }[];
  sentByName: string | null;
}

export interface Thread {
  account: Account;
  messages: MessageFull[];
  openedId: string;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  canEdit: boolean;
}

/** O que abre o editor: e-mail novo, resposta, responder a todos ou encaminhar. */
export interface ComposeDraft {
  mode: 'new' | 'reply' | 'replyAll' | 'forward';
  accountId: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  parent?: MessageFull;
}

export const FOLDER_LABEL: Record<Folder, string> = { inbox: 'Entrada', sent: 'Enviados', starred: 'Favoritos', trash: 'Lixeira' };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Algo deu errado. Tente de novo.');
  return json.data as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function shortDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const opts = { timeZone: 'America/Sao_Paulo' } as const;
  const sameDay = date.toLocaleDateString('pt-BR', opts) === now.toLocaleDateString('pt-BR', opts);
  if (sameDay) return date.toLocaleTimeString('pt-BR', { ...opts, hour: '2-digit', minute: '2-digit' });
  const sameYear = date.toLocaleDateString('pt-BR', { ...opts, year: 'numeric' }) === now.toLocaleDateString('pt-BR', { ...opts, year: 'numeric' });
  return date.toLocaleDateString('pt-BR', sameYear ? { ...opts, day: '2-digit', month: 'short' } : { ...opts, day: '2-digit', month: '2-digit', year: '2-digit' });
}

export const fullDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
