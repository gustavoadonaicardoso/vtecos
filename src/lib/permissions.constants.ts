/**
 * ============================================================
 * VÓRTICE CRM — Mapeamento de Rotas ↔ Permissões
 * ============================================================
 * Arquivo de constantes puras (sem dependências React).
 * Usado pelo hook usePermissions (src/hooks/) e pelo guard
 * de rota em RootLayoutContent.tsx.
 * ============================================================
 */

/** Mapeamento de cada rota para a permissão mínima exigida. */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  '/': 'dashboard.view',
  '/projetos': 'admin.projects',
  '/messages': 'messages.view',
  '/chat': 'messages.send',
  '/pipeline': 'pipeline.view',
  '/leads': 'leads.view',
  '/relatorios': 'dashboard.kpis',
  '/scheduling': 'integrations.view',
  '/queue': 'integrations.view',
  '/users': 'team.view',
  '/automations': 'automations.view',
  '/integrations': 'integrations.view',
  '/settings': 'admin.settings',
  '/master': 'admin.root',
};
