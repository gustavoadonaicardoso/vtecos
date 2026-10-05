/**
 * Banners da tela Início: tipos e opções compartilhados entre o Painel
 * Master (edição), o servidor (filtro) e o carrossel.
 */

export type BannerAudience = 'all' | 'clients' | 'platform' | 'tenants';

/** O que o carrossel recebe (já filtrado pelo servidor). */
export interface HomeBanner {
  id: string;
  title: string;
  description: string;
  badge: string;
  date: string;
  color: string;
  iconName: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  buttonLabel: string | null;
  dismissible: boolean;
}

/** O que o Painel Master edita. */
export interface BannerItem {
  id?: string;
  title: string;
  description: string;
  type: string;
  date: string;
  color: string;
  iconName?: string;
  imageUrl: string;
  linkUrl: string;
  buttonLabel: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  position?: number;
  audience: BannerAudience;
  targetTenants: string[];
  targetModules: string[];
  target_roles: string[];
  dismissible: boolean;
}

export const AUDIENCE_LABEL: Record<BannerAudience, string> = {
  all: 'Todas as empresas',
  clients: 'Só empresas clientes',
  platform: 'Só a equipe Vórtice',
  tenants: 'Empresas escolhidas',
};

/** Destinos prontos para o botão do banner. */
export const BANNER_DESTINATIONS: { path: string; label: string }[] = [
  { path: '/suporte', label: 'Chamados' },
  { path: '/help', label: 'Central de Ajuda' },
  { path: '/', label: 'Início' },
  { path: '/messages', label: 'Mensagens' },
  { path: '/leads', label: 'Leads' },
  { path: '/pipeline', label: 'Pipeline' },
  { path: '/scheduling', label: 'Agendamento' },
  { path: '/queue', label: 'Senhas' },
  { path: '/social', label: 'Redes Sociais' },
  { path: '/financeiro', label: 'Custos e Precificação' },
  { path: '/planejamentos', label: 'Planejamentos' },
  { path: '/automations', label: 'Automações' },
  { path: '/integrations', label: 'Integrações' },
  { path: '/relatorios', label: 'Relatórios' },
  { path: '/metas', label: 'Metas' },
  { path: '/users', label: 'Equipe' },
  { path: '/settings', label: 'Configurações' },
];

/** Caminho interno (/algo) ou link https:// -- nada de javascript: e afins. */
export function normalizeBannerLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value.slice(0, 300);
  if (/^https:\/\/[^\s]+$/i.test(value)) return value.slice(0, 500);
  return null;
}

export const isExternalLink = (url: string) => /^https?:\/\//i.test(url);

export function destinationLabel(url: string | null | undefined) {
  if (!url) return 'Sem botão';
  const known = BANNER_DESTINATIONS.find((item) => item.path === url);
  if (known) return known.label;
  return isExternalLink(url) ? url.replace(/^https?:\/\//, '') : url;
}
