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
};

export type PipelineStage = {
  id: string;
  name: string;
  color: string;
  leads: string[]; // IDs dos leads nessa stage
};
