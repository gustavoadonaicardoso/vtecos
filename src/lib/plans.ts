/**
 * ============================================================
 * VÓRTICE CRM — Catálogo de módulos dos planos
 * ============================================================
 * Um plano (tabela `plans`) guarda a lista de chaves deste catálogo.
 * `clientLogin` diz se o módulo já separa os dados por empresa e pode
 * ser aberto pelo LOGIN DO CLIENTE. Os demais continuam valendo como
 * item comercial do pacote (operados pela equipe Vórtice), mas nunca
 * são liberados para a conta do cliente -- senão ele veria os dados
 * da Vórtice.
 * Arquivo puro: usado no navegador e no servidor.
 * ============================================================
 */

export interface PlanModule {
  key: string;
  label: string;
  description: string;
  /** Rotas da interface liberadas por este módulo (login de cliente). */
  routes: string[];
  clientLogin: boolean;
}

export const PLAN_MODULES: PlanModule[] = [
  {
    key: 'financeiro',
    label: 'Custos e Precificação',
    description: 'Insumos, fichas técnicas, preço por canal, vendas, lucro e ponto de equilíbrio.',
    routes: ['/financeiro'],
    clientLogin: true,
  },
  { key: 'crm', label: 'CRM (Leads, Pipeline e Mensagens)', description: 'Atendimento e funil de vendas.', routes: [], clientLogin: false },
  { key: 'social', label: 'Redes Sociais', description: 'Calendário e publicação no Instagram/Facebook.', routes: [], clientLogin: false },
  { key: 'senhas', label: 'Senhas, Totem e Painel', description: 'Fila de atendimento presencial.', routes: [], clientLogin: false },
  { key: 'agendamento', label: 'Agendamento', description: 'Agenda e lembretes.', routes: [], clientLogin: false },
  { key: 'planejamentos', label: 'Planejamentos', description: 'Funis e mapas de estratégia.', routes: [], clientLogin: false },
  { key: 'fiscal', label: 'Notas Fiscais', description: 'Emissão de NF.', routes: [], clientLogin: false },
];

/** Páginas que todo login de cliente pode abrir, independente do plano. */
export const CLIENT_BASE_ROUTES = ['/help', '/notificacoes'];

export function moduleByKey(key: string) {
  return PLAN_MODULES.find((module) => module.key === key);
}

/** Só as chaves conhecidas, sem repetição, na ordem do catálogo. */
export function sanitizeModules(input: unknown): string[] {
  const wanted = new Set(Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : []);
  return PLAN_MODULES.filter((module) => wanted.has(module.key)).map((module) => module.key);
}

/** Módulos do plano que o login do cliente realmente pode abrir. */
export function clientModules(planModules: string[]) {
  return PLAN_MODULES.filter((module) => module.clientLogin && planModules.includes(module.key)).map((module) => module.key);
}

export function clientRoutes(modules: string[]) {
  return [
    ...PLAN_MODULES.filter((module) => modules.includes(module.key)).flatMap((module) => module.routes),
    ...CLIENT_BASE_ROUTES,
  ];
}

export function isClientRouteAllowed(pathname: string, modules: string[]) {
  return clientRoutes(modules).some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
