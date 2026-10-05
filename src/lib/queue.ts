/**
 * Senhas: tipos e regras compartilhados entre a recepção, o totem, a TV e o
 * servidor (sem nada de servidor aqui -- o navegador também importa).
 */

export type TicketStatus = 'waiting' | 'calling' | 'completed' | 'no_show' | 'canceled';
export type TicketOrigin = 'totem' | 'recepcao';

export interface QueueTicket {
  id: string;
  number: number;
  name: string;
  priority: boolean;
  status: TicketStatus;
  desk: string | null;
  origin: TicketOrigin | null;
  createdAt: string;
  calledAt: string | null;
  finishedAt: string | null;
  calledBy: string | null;
  callCount: number;
}

export interface QueueSettings {
  appName: string;
  totalDesks: number;
  deskLabel: string;
  primaryColor: string;
  welcomeText: string;
  logoUrl: string;
  bannerUrl: string;
  priorityEnabled: boolean;
  voiceEnabled: boolean;
}

export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  appName: '',
  totalDesks: 5,
  deskLabel: 'Guichê',
  primaryColor: '#4f00cb',
  welcomeText: '',
  logoUrl: '',
  bannerUrl: '',
  priorityEnabled: true,
  voiceEnabled: true,
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  waiting: 'Aguardando',
  calling: 'Em atendimento',
  completed: 'Atendida',
  no_show: 'Não compareceu',
  canceled: 'Cancelada',
};

/** "07" ou "P07" (preferencial). */
export const ticketCode = (number: number, priority = false) => `${priority ? 'P' : ''}${String(number).padStart(2, '0')}`;

/** Número do guichê como aparece na tela: "Guichê 03". */
export const deskName = (label: string, desk: string | null) => `${label || 'Guichê'} ${desk || ''}`.trim();

export const deskOptions = (total: number) => Array.from({ length: Math.max(1, Math.min(99, total)) }, (_, i) => String(i + 1).padStart(2, '0'));

/** Primeiro nome para a TV e para a saudação (vazio quando não há nome real). */
export function firstName(name: string | null | undefined) {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  return ['Cliente', 'Visitante'].includes(first) ? '' : first;
}

/** Texto falado pela TV: "Senha P 7, guichê 3." */
export function spokenCall(ticket: { number: number; priority: boolean; desk: string | null; name?: string }, deskLabel: string) {
  const who = firstName(ticket.name);
  const code = `${ticket.priority ? 'preferencial ' : ''}${ticket.number}`;
  return `${who ? `${who}, ` : ''}senha ${code}. ${deskLabel || 'Guichê'} ${Number(ticket.desk) || ticket.desk || ''}.`;
}

export const minutesBetween = (from: string, to: string | number = Date.now()) =>
  Math.max(0, Math.round(((typeof to === 'number' ? to : new Date(to).getTime()) - new Date(from).getTime()) / 60_000));
