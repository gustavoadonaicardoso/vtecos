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

// ─── Integrações — WhatsApp Business API (Meta) ───────────────

export interface WhatsAppMessagePayload {
  to: string;
  type: 'text' | 'template';
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: any[];
  };
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
