/**
 * Relatórios: tipos, períodos e textos (navegador e servidor).
 * Os números vêm de public.report_overview (migration
 * 202610210001_reports.sql), calculados no banco a partir dos dados
 * reais: leads, mensagens, vendas, automações, disparos e ligações.
 */

export type MessageKind = 'customer' | 'team' | 'phone' | 'ai' | 'automation' | 'campaign' | 'scheduled';

export const KIND_LABEL: Record<Exclude<MessageKind, 'customer'>, string> = {
  team: 'Equipe pelo sistema',
  phone: 'Equipe pelo celular',
  ai: 'Inteligência artificial',
  automation: 'Automações',
  campaign: 'Disparos',
  scheduled: 'Mensagens agendadas',
};

/** Ordem fixa das cores (paleta validada para daltonismo nos dois temas). */
export const KIND_ORDER: Exclude<MessageKind, 'customer'>[] = ['team', 'automation', 'ai', 'campaign', 'phone', 'scheduled'];

const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
};

/** Cor da série na posição `slot` (0 = azul, 1 = laranja, 2 = verde-água...). */
export const seriesColor = (slot: number, theme: string | undefined) => (theme === 'dark' ? SERIES.dark : SERIES.light)[slot % 6];
export const kindColor = (kind: Exclude<MessageKind, 'customer'>, theme: string | undefined) => seriesColor(KIND_ORDER.indexOf(kind), theme);

export interface ResponseTimes {
  /** Vezes em que o cliente puxou conversa no período. */
  turns: number;
  answered: number;
  answeredByHuman: number;
  /** Mediana em minutos (null = sem respostas). */
  medianAny: number | null;
  medianHuman: number | null;
  within5: number;
  byUser: { userId: string; name: string; count: number; median: number | null }[];
}

export interface ReportData {
  range: { from: string; to: string; label: string; days: number };
  /** Vendedor vê só os próprios números. */
  scope: 'company' | 'mine';
  leads: { new: number; newPrev: number; open: number; openValue: number };
  sales: { won: number; wonPrev: number; revenue: number; revenuePrev: number; cohortWon: number };
  messages: { received: number; receivedPrev: number; sent: number; byKind: Partial<Record<MessageKind, number>>; conversations: number; conversationsPrev: number };
  daily: { date: string; newLeads: number; won: number; revenue: number; received: number; sent: number }[];
  heatmap: number[][];
  sources: { source: string; total: number; won: number; revenue: number }[];
  funnel: { id: string; name: string; color: string; count: number; value: number }[];
  waiting: { count: number; over1h: number; oldest: { id: string; name: string; assignedTo: string | null; assignedName: string | null; since: string; waitMinutes: number }[] };
  responses: ResponseTimes;
  responsesPrev: ResponseTimes;
  team: null | { id: string; name: string; role: string; openLeads: number; newLeads: number; won: number; revenue: number; messages: number; conversations: number; firstResponses: number; medianResponse: number | null }[];
  automations: null | {
    runs: number;
    byStatus: Record<string, number>;
    flows: { id: string; name: string; runs: number; failed: number }[];
    ai: { conversations: number; replies: number; handoffs: number; resolved: number };
  };
  campaigns: null | { count: number; sent: number; failed: number; replied: number; optouts: number; top: { id: string; name: string; status: string; sent: number; replied: number; failed: number }[] };
  calls: { count: number; avgDuration: number };
}

export type PeriodKey = 'today' | '7' | '30' | '90' | 'month' | 'custom';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
  { key: '90', label: '90 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'custom', label: 'Escolher datas' },
];

/** Variação % (null sem base de comparação). */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} s`;
  if (value < 60) return `${Math.round(value)} min`;
  if (value < 60 * 24) return `${Math.floor(value / 60)}h${String(Math.round(value % 60)).padStart(2, '0')}`;
  return `${(value / 60 / 24).toFixed(1).replace('.', ',')} dias`;
}

