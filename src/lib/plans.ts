/**
 * ============================================================
 * VÓRTICE CRM — Catálogo de módulos dos planos
 * ============================================================
 * Um plano (tabela `plans`) guarda a lista de chaves deste catálogo.
 * Com a separação por empresa, todo módulo trabalha só com os dados da
 * empresa logada -- então qualquer módulo pode entrar no plano e aparecer
 * no login do cliente. A empresa da plataforma (Vórtice) tem todos.
 * Arquivo puro: usado no navegador e no servidor.
 * ============================================================
 */

export interface PlanModule {
  key: string;
  label: string;
  description: string;
  /** Páginas liberadas por este módulo. */
  routes: string[];
}

export const PLAN_MODULES: PlanModule[] = [
  {
    key: 'crm',
    label: 'CRM e Atendimento',
    description: 'Leads, pipeline, mensagens do WhatsApp, metas, relatórios, discador, disparos e automações.',
    routes: ['/leads', '/pipeline', '/messages', '/metas', '/relatorios', '/discador', '/disparos', '/automations'],
  },
  {
    key: 'financeiro',
    label: 'Custos e Precificação',
    description: 'Insumos, fichas técnicas, preço por canal, vendas, lucro e ponto de equilíbrio.',
    routes: ['/financeiro'],
  },
  { key: 'social', label: 'Redes Sociais', description: 'Calendário e publicação no Instagram/Facebook.', routes: ['/social'] },
  { key: 'senhas', label: 'Senhas, Totem e Painel', description: 'Fila de atendimento presencial com totem e TV.', routes: ['/queue'] },
  { key: 'agendamento', label: 'Agendamento', description: 'Agenda e lembretes.', routes: ['/scheduling'] },
  { key: 'planejamentos', label: 'Planejamentos e Projetos', description: 'Funis, mapas de estratégia e projetos.', routes: ['/planejamentos', '/projetos'] },
  { key: 'fiscal', label: 'Notas Fiscais', description: 'Emissão de NF.', routes: ['/fiscal'] },
];

export const ALL_MODULE_KEYS = PLAN_MODULES.map((module) => module.key);

/** Páginas que toda empresa tem, independente do plano. */
export const BASE_ROUTES = ['/', '/chat', '/users', '/integrations', '/settings', '/notificacoes', '/help'];

export function moduleByKey(key: string) {
  return PLAN_MODULES.find((module) => module.key === key);
}

/** Só as chaves conhecidas, sem repetição, na ordem do catálogo. */
export function sanitizeModules(input: unknown): string[] {
  const wanted = new Set(Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : []);
  return PLAN_MODULES.filter((module) => wanted.has(module.key)).map((module) => module.key);
}

/** Módulo que libera uma página (null = página base, sempre liberada). */
export function moduleForRoute(pathname: string) {
  return PLAN_MODULES.find((module) =>
    module.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  ) || null;
}

export function isRouteAllowed(pathname: string, modules: string[]) {
  const owner = moduleForRoute(pathname);
  return owner ? modules.includes(owner.key) : true;
}

/** Primeira página útil para quem entra (início, se nada mais). */
export function homeRoute(modules: string[]) {
  return modules.length > 0 ? '/' : '/help';
}
