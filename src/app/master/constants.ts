import {
  Activity,
  BarChart3,
  Blocks,
  Building2,
  ClipboardList,
  Layout,
  MessageCircle,
  MessageSquare,
  Palette,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Share2,
  Calculator,
  Users as UsersIcon,
  Workflow,
  Zap,
} from 'lucide-react';
import { BANNER_ICONS } from '@/components/home/bannerIcons';
import type { MasterSettings, RolePermissions, TabId } from './types';

export const DEFAULT_SETTINGS: MasterSettings = {
  siteName: 'Vórtice CRM',
  primaryColor: '#3b82f6',
  accentColor: '#8b5cf6',
  logoUrl: '',
  faviconUrl: '',
  sidebarBg: '',
};

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  ADMIN: { dashboard: { view: true, kpis: true }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: true }, team: { view: true }, automations: { view: true }, integrations: { view: true }, admin: { projects: true, settings: true }, planejamentos: { view: true }, social: { view: true }, financeiro: { view: true } },
  MANAGER: { dashboard: { view: true, kpis: true }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: true }, team: { view: true }, automations: { view: false }, integrations: { view: true }, admin: { projects: true, settings: false }, planejamentos: { view: true }, social: { view: true }, financeiro: { view: true } },
  SELLER: { dashboard: { view: true, kpis: false }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: false }, team: { view: false }, automations: { view: false }, integrations: { view: false }, admin: { projects: false, settings: false }, planejamentos: { view: true }, social: { view: true }, financeiro: { view: false } },
};

export const SIDEBAR_PRESETS = [
  { label: 'Padrão (Sistema)', value: '' },
  { label: 'Azul Escuro', value: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' },
  { label: 'Roxo Profundo', value: 'linear-gradient(180deg, #1a0533 0%, #2d1b69 100%)' },
  { label: 'Verde Floresta', value: 'linear-gradient(180deg, #052e16 0%, #14532d 100%)' },
  { label: 'Carvão', value: 'linear-gradient(180deg, #111111 0%, #1c1c1c 100%)' },
  { label: 'Azul Céu', value: 'linear-gradient(180deg, #0c1445 0%, #1d3b8a 100%)' },
  { label: 'Rosa/Violeta', value: 'linear-gradient(180deg, #4a0e3f 0%, #7b1d6c 100%)' },
  { label: 'Cobre/Ouro', value: 'linear-gradient(180deg, #1c0e00 0%, #3d2000 100%)' },
  { label: 'Branco Puro', value: '#ffffff' },
  { label: 'Cinza Claro', value: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)' },
  { label: 'Personalizado', value: '__custom__' },
];

export const BANNER_PRESET_COLORS = [
  'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ef4444, #991b1b)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #1e293b, #0f172a)',
  'linear-gradient(135deg, #06b6d4, #0891b2)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
];

export const BANNER_PRESET_ICONS = BANNER_ICONS;

export const BANNER_ROLE_OPTIONS = [
  { value: '', label: 'Todos os usuários' },
  { value: 'ADMIN', label: 'Apenas Admins' },
  { value: 'MANAGER', label: 'Apenas Gerentes' },
  { value: 'SELLER', label: 'Apenas Vendedores' },
];

/**
 * Atalhos do Módulo de Comando. `tab` abre uma aba do próprio painel;
 * `path` leva para outra página do sistema.
 */
export const MASTER_MODULES: { id: string; title: string; desc: string; icon: typeof Layout; color: string; tab?: TabId; path?: string }[] = [
  {
    id: 'tenants',
    title: 'Empresas e Planos',
    desc: 'Cadastre empresas clientes, crie o administrador de cada uma e defina os módulos de cada plano.',
    icon: Building2,
    color: '#3b82f6',
    tab: 'tenants',
  },
  {
    id: 'branding',
    title: 'Identidade Visual',
    desc: 'Nome, logo, favicon, cor principal e fundo do menu lateral do sistema.',
    icon: Palette,
    color: '#8b5cf6',
    tab: 'branding',
  },
  {
    id: 'permissions',
    title: 'Menu por Função',
    desc: 'Escolha o que gerentes e vendedores da Vórtice veem no menu lateral.',
    icon: ShieldAlert,
    color: '#ef4444',
    tab: 'permissions',
  },
  {
    id: 'banners',
    title: 'Banners da Tela Inicial',
    desc: 'Destaques e comunicados exibidos no Início para todos os usuários.',
    icon: Layout,
    color: '#06b6d4',
    tab: 'banners',
  },
  {
    id: 'team',
    title: 'Equipe e Usuários',
    desc: 'Cadastre a equipe, redefina senhas e ajuste as permissões de cada pessoa.',
    icon: UsersIcon,
    color: '#f59e0b',
    path: '/users',
  },
  {
    id: 'logs',
    title: 'Audit Logs',
    desc: 'Histórico de ações da equipe: logins, alterações e exclusões.',
    icon: Activity,
    color: '#10b981',
    path: '/admin/logs',
  },
  {
    id: 'projetos',
    title: 'Projetos',
    desc: 'Planos de ação, metas e projetos em andamento dos clientes.',
    icon: ClipboardList,
    color: '#6366f1',
    path: '/projetos',
  },
  {
    id: 'integrations',
    title: 'Integrações',
    desc: 'WhatsApp, Meta, Twilio e demais conexões da Vórtice.',
    icon: Blocks,
    color: '#ec4899',
    path: '/integrations',
  },
  {
    id: 'automations',
    title: 'Automações',
    desc: 'Regras automáticas de atendimento e de distribuição de leads.',
    icon: Zap,
    color: '#f97316',
    path: '/automations',
  },
];

/** Cada item corresponde a uma permissão; o rótulo lista as telas que ela libera. */
export const MENU_PERMISSION_ITEMS = [
  { id: 'dashboard.view', label: 'Início e Metas', icon: Layout, cat: 'dashboard', field: 'view' },
  { id: 'dashboard.kpis', label: 'Relatórios e KPIs', icon: BarChart3, cat: 'dashboard', field: 'kpis' },
  { id: 'admin.projects', label: 'Projetos', icon: ClipboardList, cat: 'admin', field: 'projects' },
  { id: 'planejamentos.view', label: 'Planejamentos (Funis)', icon: Workflow, cat: 'planejamentos', field: 'view' },
  { id: 'social.view', label: 'Redes Sociais', icon: Share2, cat: 'social', field: 'view' },
  { id: 'financeiro.view', label: 'Custos e Precificação', icon: Calculator, cat: 'financeiro', field: 'view' },
  { id: 'messages.view', label: 'Mensagens (WhatsApp)', icon: MessageSquare, cat: 'messages', field: 'view' },
  { id: 'messages.send', label: 'Chat Interno e Disparos', icon: MessageCircle, cat: 'messages', field: 'send' },
  { id: 'pipeline.view', label: 'Pipeline (Kanban)', icon: RotateCcw, cat: 'pipeline', field: 'view' },
  { id: 'leads.view', label: 'Leads e Discador', icon: UsersIcon, cat: 'leads', field: 'view' },
  { id: 'integrations.view', label: 'Integrações, Agendamento, Senhas e Notas Fiscais', icon: Blocks, cat: 'integrations', field: 'view' },
  { id: 'team.view', label: 'Equipe', icon: Settings, cat: 'team', field: 'view' },
  { id: 'automations.view', label: 'Automações', icon: Zap, cat: 'automations', field: 'view' },
];

export const ROLE_TABS: { value: 'ADMIN' | 'MANAGER' | 'SELLER'; icon: typeof ShieldCheck }[] = [
  { value: 'ADMIN', icon: ShieldCheck },
  { value: 'MANAGER', icon: UsersIcon },
  { value: 'SELLER', icon: Zap },
];
