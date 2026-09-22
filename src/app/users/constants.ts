import {
  LayoutDashboard,
  Kanban,
  Users,
  MessageSquare,
  Zap,
  Blocks,
  UserCog,
  ShieldAlert,
} from 'lucide-react';

export type Role = 'ADMIN' | 'MANAGER' | 'SELLER';
export type Status = 'ACTIVE' | 'INACTIVE';

export interface Permissions {
  dashboard: { view: boolean; kpis: boolean; funnel: boolean; activities: boolean };
  pipeline: { view: boolean; move: boolean; edit: boolean; manageStages: boolean };
  leads: { view: boolean; edit: boolean; delete: boolean; tags: boolean; export: boolean; create: boolean };
  messages: { view: boolean; send: boolean; start: boolean; addContact: boolean; templates: boolean; signatures: boolean };
  automations: { view: boolean; manage: boolean };
  integrations: { view: boolean; manage: boolean };
  team: { view: boolean; manage: boolean; editPermissions: boolean };
  admin: { banners: boolean; projects: boolean; settings: boolean };
}

export const DEFAULT_PERMISSIONS: Permissions = {
  dashboard: { view: true, kpis: true, funnel: true, activities: true },
  pipeline: { view: true, move: true, edit: true, manageStages: true },
  leads: { view: true, edit: true, delete: true, tags: true, export: true, create: true },
  messages: { view: true, send: true, start: true, addContact: true, templates: true, signatures: true },
  automations: { view: true, manage: true },
  integrations: { view: true, manage: true },
  team: { view: true, manage: true, editPermissions: true },
  admin: { banners: true, projects: true, settings: true },
};

export const SELLER_PERMISSIONS: Permissions = {
  dashboard: { view: true, kpis: true, funnel: false, activities: false },
  pipeline: { view: true, move: true, edit: true, manageStages: false },
  leads: { view: true, edit: true, delete: false, tags: true, export: false, create: false },
  messages: { view: true, send: true, start: true, addContact: false, templates: false, signatures: true },
  automations: { view: false, manage: false },
  integrations: { view: false, manage: false },
  team: { view: false, manage: false, editPermissions: false },
  admin: { banners: false, projects: false, settings: false },
};

export const CATEGORY_MAP: Record<string, { name: string; icon: any; color: string }> = {
  dashboard: { name: 'Painel Geral', icon: LayoutDashboard, color: '#3b82f6' },
  pipeline: { name: 'Funil & Kanban', icon: Kanban, color: '#8b5cf6' },
  leads: { name: 'Gestão de Lead', icon: Users, color: '#10b981' },
  messages: { name: 'Central Mensagens', icon: MessageSquare, color: '#f59e0b' },
  automations: { name: 'Robôs/Automações', icon: Zap, color: '#ef4444' },
  integrations: { name: 'Canais/API', icon: Blocks, color: '#3b82f6' },
  team: { name: 'Gestão de Equipe', icon: UserCog, color: '#10b981' },
  admin: { name: 'Config. Avançadas', icon: ShieldAlert, color: '#ef4444' },
};

export const FIELD_MAP: Record<string, string> = {
  view: 'Visualizar Módulo',
  kpis: 'Ver Indicadores',
  funnel: 'Ver Funil de Vendas',
  activities: 'Logs de Atividade',
  move: 'Mover no Kanban',
  edit: 'Editar Registros',
  manageStages: 'Criar Etapas',
  delete: 'Excluir Registros',
  tags: 'Gerenciar Tags',
  export: 'Exportar Lead',
  create: 'Adicionar Contato',
  send: 'Enviar Mensagem',
  start: 'Novo Chat',
  addContact: 'Adicionar Contato',
  templates: 'Gerenciar Modelos',
  signatures: 'Usar Assinatura',
  manage: 'Acesso Total',
  editPermissions: 'Alterar Permissões',
  banners: 'Gerenciar Banners',
  projects: 'Gerenciar Projetos',
  settings: 'Config. Sistema',
};
