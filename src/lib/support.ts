/**
 * Central de chamados: tipos e textos compartilhados entre o servidor, a
 * tela do cliente e a caixa de atendimento da Vórtice.
 */

export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'duvida' | 'problema' | 'pedido' | 'financeiro' | 'outro';

export interface SupportAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
  /** Link temporário (o bucket é privado). */
  url?: string;
}

export interface SupportTicketSummary {
  id: string;
  code: number;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  tenantId: string;
  tenantName: string;
  openedBy: string | null;
  openedByName: string;
  assignedTo: string | null;
  assignedName: string | null;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  lastCustomerAt: string | null;
  lastStaffAt: string | null;
}

export interface SupportMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  side: 'customer' | 'staff' | 'system';
  body: string;
  internal: boolean;
  attachments: SupportAttachment[];
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  contactPhone: string | null;
  notifyWhatsapp: boolean;
  openedByEmail: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  rating: number | null;
  ratingComment: string | null;
  messages: SupportMessage[];
}

/** Rótulos para o cliente (a Vórtice vê "Aguardando cliente"). */
export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_customer: 'Aguardando você',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};

export const STAFF_STATUS_LABEL: Record<TicketStatus, string> = {
  ...STATUS_LABEL,
  waiting_customer: 'Aguardando cliente',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

/** Como o cliente descreve a urgência ao abrir. */
export const CUSTOMER_PRIORITY: { value: TicketPriority; label: string; hint: string }[] = [
  { value: 'low', label: 'Posso esperar', hint: 'Dúvida ou ajuste sem pressa' },
  { value: 'normal', label: 'Normal', hint: 'Preciso de ajuda, mas consigo trabalhar' },
  { value: 'high', label: 'Atrapalha meu trabalho', hint: 'Uma parte importante não funciona' },
  { value: 'urgent', label: 'Sistema parado', hint: 'Não consigo usar o sistema' },
];

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  duvida: 'Dúvida',
  problema: 'Problema ou erro',
  pedido: 'Pedido de ajuste ou melhoria',
  financeiro: 'Plano e pagamento',
  outro: 'Outro assunto',
};

export const OPEN_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting_customer'];

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = 'image/*,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.zip';

export const ticketLabel = (code: number) => `#${code}`;
