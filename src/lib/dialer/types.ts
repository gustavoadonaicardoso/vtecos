/**
 * Discador automático: tipos e rótulos compartilhados entre o servidor
 * e as telas.
 */

export type CampaignStatus = 'draft' | 'running' | 'paused' | 'finished';
export type ContactStatus = 'pending' | 'dialing' | 'connected' | 'completed' | 'no_answer' | 'busy' | 'voicemail' | 'abandoned' | 'failed';
export type AgentStatus = 'offline' | 'paused' | 'available' | 'on_call' | 'wrapup';

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Pronta para começar',
  running: 'Ligando',
  paused: 'Pausada',
  finished: 'Concluída',
};

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  pending: 'Na fila',
  dialing: 'Chamando',
  connected: 'Em atendimento',
  completed: 'Atendida',
  no_answer: 'Não atendeu',
  busy: 'Ocupado',
  voicemail: 'Caixa postal',
  abandoned: 'Sem atendente livre',
  failed: 'Falhou',
};

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  offline: 'Offline',
  paused: 'Em pausa',
  available: 'Disponível',
  on_call: 'Em ligação',
  wrapup: 'Finalizando',
};

/** Resultado que o atendente marca ao terminar a ligação. */
export const OUTCOMES: { key: string; label: string }[] = [
  { key: 'interested', label: 'Interessado' },
  { key: 'callback', label: 'Retornar depois' },
  { key: 'not_interested', label: 'Sem interesse' },
  { key: 'wrong_number', label: 'Número errado' },
  { key: 'other', label: 'Outro' },
];

export const outcomeLabel = (key: string | null | undefined) => OUTCOMES.find((item) => item.key === key)?.label || '';

/** Situações que podem voltar para a fila ("Ligar de novo"). */
export const RETRYABLE: ContactStatus[] = ['no_answer', 'busy', 'abandoned', 'failed', 'voicemail'];

export type StatusCounts = Partial<Record<ContactStatus, number>>;

export interface DialerCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  callsPerAgent: number;
  detectVoicemail: boolean;
  ringSeconds: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  counts: StatusCounts;
  total: number;
}

export interface DialerContact {
  id: string;
  name: string | null;
  phone: string;
  data: Record<string, string>;
  status: ContactStatus;
  attempts: number;
  agentName: string | null;
  answeredBy: string | null;
  outcome: string | null;
  notes: string | null;
  duration: number | null;
  talkSeconds: number | null;
  hasRecording: boolean;
  error: string | null;
  dialedAt: string | null;
  endedAt: string | null;
}

export interface AgentState {
  status: AgentStatus;
  since: string;
  connected: boolean;
  phoneNumber: string | null;
  contact: (DialerContact & { campaignName: string }) | null;
  /** Campanhas ligando agora e quantos contatos ainda estão na fila. */
  running: { id: string; name: string; pending: number }[];
}

export interface TeamAgent {
  profileId: string;
  name: string;
  status: AgentStatus;
  since: string;
  contactName: string | null;
}
