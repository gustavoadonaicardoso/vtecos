export type ItemType = 'task' | 'event';
export type ItemStatus = 'todo' | 'in-progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';

export interface AgendaItem {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  priority: Priority;
  status: ItemStatus;
  date: string;
  time: string | null;
  leadId: string | null;
  leadName: string | null;
  assignedTo: string | null;
  createdBy: string | null;
  remindMinutes: number | null;
}

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

export type Tab = 'agenda' | 'tasks' | 'sends';

export const STATUS_LABEL: Record<ItemStatus, string> = { todo: 'Para fazer', 'in-progress': 'Em andamento', done: 'Concluído' };
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' };
export const SEND_STATUS_LABEL: Record<ScheduledSend['status'], string> = {
  pending: 'Agendado',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Não enviado',
  canceled: 'Cancelado',
};

export const REMINDERS: { value: number | null; label: string }[] = [
  { value: null, label: 'Sem lembrete' },
  { value: 0, label: 'Na hora' },
  { value: 10, label: '10 min antes' },
  { value: 30, label: '30 min antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '1 dia antes' },
];

/** Data local no formato AAAA-MM-DD. */
export const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const parseYmd = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** As 42 casas do mês (6 semanas, começando no domingo). */
export function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { date, key: ymd(date), inMonth: date.getMonth() === month.getMonth() };
  });
}

export const monthTitle = (month: Date) => {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export function dayTitle(key: string, todayKey: string) {
  const date = parseYmd(key);
  const today = parseYmd(todayKey);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400_000);
  const label = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(date);
  const prefix = diff === 0 ? 'Hoje · ' : diff === 1 ? 'Amanhã · ' : diff === -1 ? 'Ontem · ' : '';
  return prefix + label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortDate(key: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(parseYmd(key));
}

export const sortItems = (list: AgendaItem[]) =>
  [...list].sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));

/** Tarefa aberta com data anterior a hoje. */
export const isOverdue = (item: AgendaItem, todayKey: string) => item.type === 'task' && item.status !== 'done' && item.date < todayKey;

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Algo deu errado. Tente de novo.');
  return json as T;
}
