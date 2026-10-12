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
    description: 'Leads, pipeline, mensagens do WhatsApp, metas e relatórios.',
    routes: ['/leads', '/pipeline', '/messages', '/metas', '/relatorios'],
  },
  {
    key: 'automacoes',
    label: 'Automações e IA',
    description: 'Fluxos automáticos, respostas e Atendente com IA no WhatsApp, Direct e Messenger.',
    routes: ['/automations'],
  },
  { key: 'disparos', label: 'Disparos', description: 'Campanhas de mensagens em massa pelo WhatsApp.', routes: ['/disparos'] },
  { key: 'discador', label: 'Discador', description: 'Ligações pelo navegador e discagem automática (Twilio da empresa).', routes: ['/discador'] },
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
  { key: 'email', label: 'E-mail', description: 'Caixas de e-mail da empresa e de cada usuário: receber, responder e enviar.', routes: ['/email'] },
];

export const ALL_MODULE_KEYS = PLAN_MODULES.map((module) => module.key);

// ── Limites do plano ─────────────────────────────────────────

/** null = sem limite; 0 = não incluído. */
export interface PlanLimits {
  max_users: number | null;
  ai_monthly_limit: number | null;
  blast_daily_limit: number | null;
}

export const NO_LIMITS: PlanLimits = { max_users: null, ai_monthly_limit: null, blast_daily_limit: null };

export const LIMIT_INFO: { key: keyof PlanLimits; label: string; unit: string; hint: string }[] = [
  { key: 'max_users', label: 'Usuários', unit: 'usuários', hint: 'Usuários ativos da empresa.' },
  { key: 'ai_monthly_limit', label: 'IA por mês', unit: 'usos de IA por mês', hint: 'Respostas do Atendente com IA, legendas e outros usos da IA da Vórtice. Quem cadastra a própria chave do Gemini não tem limite.' },
  { key: 'blast_daily_limit', label: 'Disparos por dia', unit: 'mensagens de disparo por dia', hint: 'Soma de todas as campanhas da empresa no dia.' },
];

/** Número inteiro ≥ 0, ou null (vazio = sem limite). */
export function parseLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 10_000_000) : null;
}

export function limitsOf(row: Record<string, unknown> | null | undefined): PlanLimits {
  return {
    max_users: parseLimit(row?.max_users),
    ai_monthly_limit: parseLimit(row?.ai_monthly_limit),
    blast_daily_limit: parseLimit(row?.blast_daily_limit),
  };
}

/** "Até 5 usuários", "500 usos de IA por mês", "Sem limite"... */
export function limitLabel(key: keyof PlanLimits, value: number | null) {
  const info = LIMIT_INFO.find((item) => item.key === key)!;
  if (value === null) return 'Sem limite';
  if (value === 0) return 'Não incluído';
  return `${key === 'max_users' ? 'Até ' : ''}${value.toLocaleString('pt-BR')} ${value === 1 && key === 'max_users' ? 'usuário' : info.unit}`;
}

/** Páginas que toda empresa tem, independente do plano. */
export const BASE_ROUTES = ['/', '/chat', '/users', '/integrations', '/settings', '/notificacoes', '/help', '/suporte'];

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
