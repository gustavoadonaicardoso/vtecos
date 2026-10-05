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
  financeiro?: { view?: boolean };
}

/** Empresa e plano de quem está logado. */
export interface ClientWorkspace {
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  /** Empresa dona da plataforma (Vórtice): acesso ao Painel Master. */
  is_platform: boolean;
  plan_id: string | null;
  plan_name: string | null;
  /** Módulos do plano liberados para a empresa (todos na plataforma). */
  modules: string[];
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
  tenant_id: string | null;
  /** STAFF = equipe da empresa dona da plataforma; CLIENT = empresa cliente. */
  account_type?: 'STAFF' | 'CLIENT';
  workspace?: ClientWorkspace | null;
  is_super_admin?: boolean;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'SELLER';
  status: 'ACTIVE' | 'INACTIVE';
  permissions: UserPermissions;
  allowed_templates?: string[]; // empty = vê todos; com IDs = apenas os listados
  phone?: string | null;
  avatar_url?: string | null;
  /** Admin da Vórtice dentro de uma empresa cliente (modo suporte). */
  support_access?: SupportAccessInfo | null;
}

export interface SupportAccessInfo {
  session_id: string;
  tenant_id: string;
  tenant_name: string;
  reason: string;
  started_at: string;
  expires_at: string;
  /** Empresa de verdade da pessoa (a Vórtice). */
  home_tenant_id: string;
}
