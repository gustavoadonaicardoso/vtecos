// ─── CRM — Leads & Pipeline ──────────────────────────────────

export type Lead = {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  tags: string[];
  pipelineStage: string;
  entryDate: string;
  /** Data/hora de criação (ISO) — usada nos relatórios por período e horário. */
  createdAt?: string;
  /** 'Ativo' ou 'Bloqueado' (leads.blocked). */
  status: string;
  color: string;
  channels: string[];
  lastMsg: string;
  value?: string;
  days?: number;
  source?: string;
  handlingTime?: number; // em minutos
  waitTime?: number;     // em minutos
  assignedTo?: string | null;
  /** Valor em número (o campo `value` é o texto formatado em R$). */
  valueNumber?: number;
  notes?: string;
  lastActivityAt?: string | null;
};

/** Etiqueta cadastrada pela empresa. */
export type LeadTag = {
  name: string;
  color: string;
  /** Quantos leads usam (só na listagem da tela de etiquetas). */
  count?: number;
};

export type PipelineStage = {
  id: string;
  name: string;
  color: string;
  leads: string[]; // IDs dos leads nessa stage
};
