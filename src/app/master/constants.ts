import {
  Activity,
  Award,
  BarChart3,
  Blocks,
  ClipboardList,
  Flame,
  Globe,
  Layout,
  Lock,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  Rocket,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Users as UsersIcon,
  Zap,
} from 'lucide-react';
import type { MasterSettings, RolePermissions } from './types';

export const DEFAULT_SETTINGS: MasterSettings = {
  siteName: 'Vórtice CRM',
  primaryColor: '#3b82f6',
  accentColor: '#8b5cf6',
  bgColor: '#0a0a0f',
  logoText: 'Vórtice CRM',
  logoUrl: '',
  faviconUrl: '',
  sidebarBg: '',
};

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  ADMIN: { dashboard: { view: true, kpis: true }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: true }, team: { view: true }, automations: { view: true }, integrations: { view: true }, admin: { projects: true, settings: true } },
  MANAGER: { dashboard: { view: true, kpis: true }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: true }, team: { view: true }, automations: { view: false }, integrations: { view: true }, admin: { projects: true, settings: false } },
  SELLER: { dashboard: { view: true, kpis: false }, pipeline: { view: true }, leads: { view: true }, messages: { view: true, send: false }, team: { view: false }, automations: { view: false }, integrations: { view: false }, admin: { projects: false, settings: false } },
};

export const SIDEBAR_PRESETS = [
  { label: 'Padrão (Sistema)', value: '' },
  { label: 'Azul Escuro', value: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' },
  { label: 'Roxo Profundo', value: 'linear-gradient(180deg, #1a0533 0%, #2d1b69 100%)' },
  { label: 'Verde Flóresta', value: 'linear-gradient(180deg, #052e16 0%, #14532d 100%)' },
  { label: 'Carvão', value: 'linear-gradient(180deg, #111111 0%, #1c1c1c 100%)' },
  { label: 'Azul Céu', value: 'linear-gradient(180deg, #0c1445 0%, #1d3b8a 100%)' },
  { label: 'Rosa/Violâ', value: 'linear-gradient(180deg, #4a0e3f 0%, #7b1d6c 100%)' },
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

export const BANNER_PRESET_ICONS = [
  { id: 'zap', icon: Zap },
  { id: 'flame', icon: Flame },
  { id: 'rocket', icon: Rocket },
  { id: 'star', icon: Star },
  { id: 'shield', icon: Shield },
  { id: 'globe', icon: Globe },
  { id: 'award', icon: Award },
  { id: 'sparkles', icon: Sparkles },
];

export const BANNER_ROLE_OPTIONS = [
  { value: '', label: 'Todos os usuários' },
  { value: 'ADMIN', label: 'Apenas Admins' },
  { value: 'MANAGER', label: 'Apenas Gerentes' },
  { value: 'SELLER', label: 'Apenas Vendedores' },
];

export const MASTER_MODULES = [
  {
    id: 'banners',
    title: 'Gestão de Banners',
    desc: 'Altere os destaques e avisos exibidos na página inicial para todos os usuários.',
    icon: Layout,
    color: '#3b82f6',
    path: '/admin/banners',
  },
  {
    id: 'projetos',
    title: 'Planos de Ação',
    desc: 'Formule as estratégias, metas e projetos em andamento dos seus clientes.',
    icon: ClipboardList,
    color: '#8b5cf6',
    path: '/admin/projetos',
  },
  {
    id: 'permissions',
    title: 'Níveis de Permissão',
    desc: 'Configure papéis de acesso e permissões granulares de toda a estação.',
    icon: ShieldAlert,
    color: '#ef4444',
    path: '/users',
  },
  {
    id: 'logs',
    title: 'Audit Logs',
    desc: 'Veja o histórico completo de ações de todos os atendentes e robôs.',
    icon: Activity,
    color: '#10b981',
    path: '/admin/logs',
  },
  {
    id: 'automations',
    title: 'Configurações Master',
    desc: 'Ajuste tempos globais de expiração e limites de API.',
    icon: Settings,
    color: '#f59e0b',
    path: '/automations',
  },
];

export const MENU_PERMISSION_ITEMS = [
  { id: 'dashboard.view', label: 'Dashboard (Início)', icon: Layout, cat: 'dashboard', field: 'view' },
  { id: 'admin.projects', label: 'Projetos', icon: ClipboardList, cat: 'admin', field: 'projects' },
  { id: 'messages.view', label: 'Mensagens (WhatsApp)', icon: MessageSquare, cat: 'messages', field: 'view' },
  { id: 'messages.send', label: 'Chat Interno', icon: MessageCircle, cat: 'messages', field: 'send' },
  { id: 'pipeline.view', label: 'Pipeline/Kanban', icon: RotateCcw, cat: 'pipeline', field: 'view' },
  { id: 'leads.view', label: 'Gestão de Leads', icon: UsersIcon, cat: 'leads', field: 'view' },
  { id: 'dashboard.kpis', label: 'Relatórios/KPIs', icon: BarChart3, cat: 'dashboard', field: 'kpis' },
  { id: 'integrations.view', label: 'Integrações e Agendamento', icon: Blocks, cat: 'integrations', field: 'view' },
  { id: 'team.view', label: 'Gestão de Equipe', icon: Settings, cat: 'team', field: 'view' },
  { id: 'automations.view', label: 'Automações', icon: Zap, cat: 'automations', field: 'view' },
  { id: 'admin.settings', label: 'Configurações', icon: Lock, cat: 'admin', field: 'settings' },
];

export const ROLE_TABS: { value: 'ADMIN' | 'MANAGER' | 'SELLER'; icon: typeof ShieldCheck }[] = [
  { value: 'ADMIN', icon: ShieldCheck },
  { value: 'MANAGER', icon: UsersIcon },
  { value: 'SELLER', icon: Zap },
];
