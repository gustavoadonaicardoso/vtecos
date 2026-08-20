/**
 * ============================================================
 * VÓRTICE CRM — Tipos Centralizados
 * ============================================================
 * Todas as interfaces e types do projeto ficam aqui.
 * Nunca defina tipos diretamente nos components ou contexts.
 * ============================================================
 */

// ─── Autenticação & Usuários ─────────────────────────────────

export interface UserPermissions {
  dashboard?: { view?: boolean; kpis?: boolean; funnel?: boolean; activities?: boolean };
  messages?: { view?: boolean; send?: boolean; start?: boolean; addContact?: boolean; templates?: boolean; signatures?: boolean };
  pipeline?: { view?: boolean; move?: boolean; edit?: boolean; manageStages?: boolean };
  leads?: { view?: boolean; edit?: boolean; delete?: boolean; tags?: boolean; export?: boolean; create?: boolean };
  team?: { view?: boolean; manage?: boolean; editPermissions?: boolean };
  automations?: { view?: boolean; manage?: boolean };
  integrations?: { view?: boolean; manage?: boolean };
  admin?: { settings?: boolean; projects?: boolean; banners?: boolean; root?: boolean };
}

export interface Tenant {
  id: string;
  name: string;
  domain?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  created_at: string;
}

export interface UserProfile {
  id: string;
  tenant_id: string;
  is_super_admin?: boolean;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'SELLER';
  status: 'ACTIVE' | 'INACTIVE';
  permissions: UserPermissions;
  allowed_templates?: string[]; // empty = vê todos; com IDs = apenas os listados
  phone?: string | null;
  avatar_url?: string | null;
}

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

// ─── Notificações ─────────────────────────────────────────────

export interface SystemNotification {
  id: string;
  type: 'chat' | 'automation' | 'lead' | 'task' | 'system';
  title: string;
  content: string;
  created_at: string;
  is_read: boolean;
  user_id: string;
  link?: string;
}

// ─── Banners da Plataforma ────────────────────────────────────

export interface PlatformBanner {
  id: string;
  title: string;
  description: string;
  date: string;
  type: string;
  color: string;
  iconName?: string;
  /** [] vazio = exibir para todos | ['SELLER'] = apenas sellers */
  target_roles: string[];
  is_active?: boolean;
  created_at?: string;
}

// ─── KPI — Dashboard Individual ───────────────────────────────

export interface KPIItem {
  label: string;
  value: string;
  trend: string;
  trendPositive?: boolean;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
}

// ─── Atividades / Feed ────────────────────────────────────────

export interface ActivityItem {
  id?: string;
  user_name: string;
  action: string;
  target?: string;
  icon_name?: string;
  created_at: string;
}

// ─── Auditoria ────────────────────────────────────────────────

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LEAD_CREATE'
  | 'LEAD_UPDATE'
  | 'LEAD_DELETE'
  | 'TICKET_CREATE'
  | 'TICKET_CALL'
  | 'TICKET_COMPLETE'
  | 'SETTINGS_UPDATE';

export interface AuditLog {
  user_id: string;
  user_name: string;
  action: AuditAction;
  details: string;
  entity_type?: string;
  entity_id?: string;
}

// ─── Integrações — Z-API (WhatsApp) ──────────────────────────

export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken?: string;
  receiveGroups?: boolean;
}

export interface ZApiSendOptions {
  delayMessage?: number;
  delayTyping?: number;
}

// ─── Integrações — WhatsApp Business Cloud API (Meta) ─────────

/** Configuração completa da Meta Cloud API */
export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  appSecret?: string;
  apiVersion?: string; // default: v21.0
}

/** Payload de mensagem de saída — suporta todos os tipos Meta */
export interface WhatsAppMessagePayload {
  to: string;
  type: 'text' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'interactive' | 'reaction' | 'location';
  text?: { body: string; preview_url?: boolean };
  template?: {
    name: string;
    language: { code: string };
    components?: WhatsAppTemplateComponent[];
  };
  image?: { link: string; caption?: string };
  video?: { link: string; caption?: string };
  audio?: { link: string };
  document?: { link: string; caption?: string; filename?: string };
  interactive?: WhatsAppInteractiveMessage;
  reaction?: { message_id: string; emoji: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
    text?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
    date_time?: { fallback_value: string };
    image?: { link: string };
    document?: { link: string; filename: string };
  }>;
}

export interface WhatsAppInteractiveMessage {
  type: 'button' | 'list' | 'product' | 'product_list';
  header?: { type: 'text' | 'image' | 'video' | 'document'; text?: string; image?: { link: string } };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
    button?: string;
    sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  };
}

// ─── Webhook Meta — Payload de entrada ────────────────────────

/** Estrutura completa do payload POST enviado pela Meta ao webhook */
export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string; // WABA ID
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookValue;
  field: 'messages';
}

export interface WhatsAppWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: { name: string };
    wa_id: string;
  }>;
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppMessageStatus[];
  errors?: WhatsAppWebhookError[];
}

/** Mensagem recebida via webhook */
export interface WhatsAppInboundMessage {
  id: string;               // ID da mensagem (wamid)
  from: string;             // Número do remetente (com código país, sem +)
  timestamp: string;        // Unix timestamp
  type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'order' | 'unsupported';
  text?: { body: string };
  audio?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string; sha256: string };
  video?: { id: string; mime_type: string; caption?: string; sha256: string };
  document?: { id: string; filename: string; mime_type: string; caption?: string; sha256: string };
  sticker?: { id: string; mime_type: string; animated: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload: string; text: string };
  context?: { from: string; id: string }; // Se for reply a outra msg
  errors?: WhatsAppWebhookError[];
}

/** Atualização de status de mensagem enviada */
export interface WhatsAppMessageStatus {
  id: string;           // wamid da mensagem enviada
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: { type: 'business_initiated' | 'customer_initiated' | 'referral_conversion' };
    expiration_timestamp?: string;
  };
  pricing?: { pricing_model: string; billable: boolean; category: string };
  errors?: WhatsAppWebhookError[];
}

export interface WhatsAppWebhookError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

// ─── Integrações — Meta Messaging (Instagram/Messenger) ───────

export interface MetaMessagePayload {
  recipientId: string;
  message: {
    text?: string;
    attachment?: {
      type: 'image' | 'video' | 'audio' | 'file' | 'template';
      payload: any;
    };
  };
  platform: 'messenger' | 'instagram';
}

// ─── Configurações de Tema/Branding ──────────────────────────

export interface BrandingConfig {
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  favicon_url: string;
  app_name: string;
  sidebar_bg: string;
}

export type Theme = 'dark' | 'light';

// ─── Utilitários ──────────────────────────────────────────────

/** Resultado padrão para operações assíncronas */
export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
