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
  '/planejamentos': 'planejamentos.view',
  '/social': 'social.view',
  '/financeiro': 'financeiro.view',
  '/metas': 'dashboard.view',
  '/messages': 'messages.view',
  '/chat': 'messages.send',
  '/pipeline': 'pipeline.view',
  '/leads': 'leads.view',
  '/relatorios': 'dashboard.kpis',
  '/scheduling': 'integrations.view',
  '/queue': 'integrations.view',
  '/users': 'team.view',
  '/automations': 'automations.view',
  '/disparos': 'messages.send',
  '/discador': 'leads.view',
  '/integrations': 'integrations.view',
  '/master': 'admin.root',
};

/** Permissão de uma página, incluindo as internas (/disparos/nova usa a de /disparos). */
export function routePermission(pathname: string): string | undefined {
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];
  const parent = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => route !== '/' && pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? ROUTE_PERMISSIONS[parent] : undefined;
}

/**
 * Catálogo ÚNICO das permissões que o sistema realmente usa -- a tela
 * Equipe e o "Menu por função" do Painel Master leem daqui.
 * `kind: 'menu'` libera páginas (ROUTE_PERMISSIONS acima);
 * `kind: 'action'` libera um recurso dentro de uma página.
 * `module`: módulo do plano exigido (null = toda empresa tem).
 * Administrador sempre tem tudo (usePermissions).
 */
export interface PermissionItem {
  id: string;
  cat: string;
  field: string;
  label: string;
  description: string;
  module: string | null;
  kind: 'menu' | 'action';
}

const item = (id: string, label: string, description: string, module: string | null, kind: 'menu' | 'action' = 'menu'): PermissionItem => {
  const [cat, field] = id.split('.');
  return { id, cat, field, label, description, module, kind };
};

export const PERMISSION_ITEMS: PermissionItem[] = [
  item('dashboard.view', 'Início e Metas', 'Tela inicial, metas e atividades da equipe.', null),
  item('dashboard.kpis', 'Relatórios', 'Relatórios e indicadores de vendas.', 'crm'),
  item('pipeline.view', 'Pipeline', 'Funil de vendas em colunas (Kanban).', 'crm'),
  item('leads.view', 'Leads e Discador', 'Lista de contatos e ligações.', 'crm'),
  item('messages.view', 'Mensagens', 'Conversas do WhatsApp com os clientes.', 'crm'),
  item('messages.send', 'Chat interno e Disparos', 'Conversa com a equipe e campanhas em massa.', null),
  item('automations.view', 'Automações', 'Ver os fluxos automáticos (editar é de admin e gerente).', 'crm'),
  item('planejamentos.view', 'Planejamentos', 'Funis, mapas de estratégia e quadros.', 'planejamentos'),
  item('admin.projects', 'Projetos', 'Planos de ação e projetos.', 'planejamentos'),
  item('social.view', 'Redes Sociais', 'Calendário e posts do Instagram e Facebook.', 'social'),
  item('financeiro.view', 'Custos e Precificação', 'Insumos, fichas técnicas, preços e vendas.', 'financeiro'),
  item('integrations.view', 'Integrações, Agendamento e Senhas', 'Conexões, agenda e fila de atendimento.', null),
  item('team.view', 'Equipe', 'Ver a equipe (cadastrar e editar é só de administradores).', null),
  item('leads.create', 'Cadastrar contato', 'Botão de novo contato na tela de Mensagens.', 'crm', 'action'),
  item('messages.templates', 'Mensagens rápidas', 'Usar os modelos de mensagem nas conversas.', 'crm', 'action'),
];

export type PermissionMap = Record<string, Record<string, boolean>>;
export type TeamRole = 'ADMIN' | 'MANAGER' | 'SELLER';

function permissionsFrom(enabled: string[]): PermissionMap {
  const map: PermissionMap = {};
  for (const permission of PERMISSION_ITEMS) {
    map[permission.cat] = { ...map[permission.cat], [permission.field]: enabled.includes(permission.id) };
  }
  return map;
}

const ALL_IDS = PERMISSION_ITEMS.map((permission) => permission.id);

/** Ponto de partida de cada cargo (novo membro e "Restaurar padrão do cargo"). */
export const ROLE_DEFAULT_PERMISSIONS: Record<TeamRole, PermissionMap> = {
  ADMIN: permissionsFrom(ALL_IDS),
  MANAGER: permissionsFrom(ALL_IDS),
  SELLER: permissionsFrom([
    'dashboard.view', 'pipeline.view', 'leads.view', 'messages.view', 'messages.send',
    'planejamentos.view', 'social.view', 'leads.create', 'messages.templates',
  ]),
};

/** Só as permissões do catálogo, com valor booleano (o resto é descartado). */
export function sanitizePermissions(input: unknown): PermissionMap {
  const source = input && typeof input === 'object' ? (input as Record<string, Record<string, unknown>>) : {};
  const map: PermissionMap = {};
  for (const permission of PERMISSION_ITEMS) {
    map[permission.cat] = { ...map[permission.cat], [permission.field]: source[permission.cat]?.[permission.field] === true };
  }
  return map;
}

/**
 * Mesmo critério do usePermissions: perfil sem nenhuma permissão gravada
 * vê tudo (contas antigas); senão, só o que estiver ligado.
 */
export function permissionEnabled(permissions: unknown, id: string) {
  if (!permissions || typeof permissions !== 'object' || Object.keys(permissions).length === 0) return true;
  const [cat, field] = id.split('.');
  return (permissions as PermissionMap)[cat]?.[field] === true;
}

/**
 * Regra única (tela e servidor): administrador pode tudo; os demais
 * precisam de pelo menos uma das permissões pedidas ligada no perfil.
 */
export function profileHasPermission(profile: { role?: string | null; permissions?: unknown } | null | undefined, ids: string | string[]) {
  if (!profile) return false;
  if (profile.role === 'ADMIN') return true;
  const list = Array.isArray(ids) ? ids : [ids];
  return list.length === 0 || list.some((id) => permissionEnabled(profile.permissions, id));
}

export function permissionLabel(id: string) {
  return PERMISSION_ITEMS.find((permission) => permission.id === id)?.label || id;
}
