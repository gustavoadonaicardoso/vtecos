import {
  Activity,
  BarChart3,
  Blocks,
  Building2,
  ClipboardList,
  Layout,
  LifeBuoy,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Palette,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Share2,
  Calculator,
  UserPlus,
  Users as UsersIcon,
  Workflow,
  Zap,
} from 'lucide-react';
import { BANNER_ICONS } from '@/components/home/bannerIcons';
import { PERMISSION_ITEMS, ROLE_DEFAULT_PERMISSIONS } from '@/lib/permissions.constants';
import type { MasterSettings, RolePermissions, TabId } from './types';

export const DEFAULT_SETTINGS: MasterSettings = {
  siteName: 'Vórtice CRM',
  primaryColor: '#3b82f6',
  accentColor: '#8b5cf6',
  logoUrl: '',
  faviconUrl: '',
  sidebarBg: '',
};

/** Padrões por cargo: os mesmos da tela Equipe (catálogo em permissions.constants). */
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = ROLE_DEFAULT_PERMISSIONS;

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
    id: 'help',
    title: 'Central de Ajuda',
    desc: 'Edite categorias, artigos, tutoriais de integração e perguntas frequentes.',
    icon: LifeBuoy,
    color: '#14b8a6',
    tab: 'help',
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

const PERMISSION_ICONS: Record<string, typeof Layout> = {
  'dashboard.view': Layout,
  'dashboard.kpis': BarChart3,
  'admin.projects': ClipboardList,
  'planejamentos.view': Workflow,
  'social.view': Share2,
  'financeiro.view': Calculator,
  'messages.view': MessageSquare,
  'messages.send': MessageCircle,
  'pipeline.view': RotateCcw,
  'leads.view': UsersIcon,
  'integrations.view': Blocks,
  'team.view': Settings,
  'automations.view': Zap,
  'leads.create': UserPlus,
  'messages.templates': MessageSquareText,
};

/** Cada item corresponde a uma permissão do catálogo único (o mesmo da tela Equipe). */
export const MENU_PERMISSION_ITEMS = PERMISSION_ITEMS.map((permission) => ({
  ...permission,
  icon: PERMISSION_ICONS[permission.id] || Settings,
}));

export const ROLE_TABS: { value: 'ADMIN' | 'MANAGER' | 'SELLER'; icon: typeof ShieldCheck }[] = [
  { value: 'ADMIN', icon: ShieldCheck },
  { value: 'MANAGER', icon: UsersIcon },
  { value: 'SELLER', icon: Zap },
];
