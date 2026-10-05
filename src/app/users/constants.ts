import { PERMISSION_ITEMS, ROLE_DEFAULT_PERMISSIONS, permissionEnabled, sanitizePermissions, type PermissionMap, type TeamRole } from '@/lib/permissions.constants';

export type Role = TeamRole;
export type Status = 'ACTIVE' | 'INACTIVE';

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  permissions: PermissionMap | null;
  allowed_templates: string[] | null;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  last_seen_at?: string | null;
}

export interface Template {
  id: string;
  name: string;
}

export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Administrador', MANAGER: 'Gerente', SELLER: 'Vendedor' };

export const ROLE_HINT: Record<Role, string> = {
  ADMIN: 'Acesso a tudo: cadastra a equipe, integrações e configurações.',
  MANAGER: 'Vê os leads de todos e edita automações e modelos. Não mexe na equipe.',
  SELLER: 'Vê só os leads dele e as páginas liberadas abaixo.',
};

export const STATUS_LABEL: Record<Status, string> = { ACTIVE: 'Ativo', INACTIVE: 'Inativo' };

/** Permissões que se aplicam ao plano da empresa. */
export function availablePermissions(modules: string[] | null) {
  return PERMISSION_ITEMS.filter((item) => !item.module || !modules || modules.includes(item.module));
}

/** Perfil sem nada gravado vê tudo: vira um mapa explícito para editar. */
export function editablePermissions(permissions: unknown): PermissionMap {
  return permissions && typeof permissions === 'object' && Object.keys(permissions).length > 0
    ? sanitizePermissions(permissions)
    : sanitizePermissions(ROLE_DEFAULT_PERMISSIONS.ADMIN);
}

export { permissionEnabled, ROLE_DEFAULT_PERMISSIONS };

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] || '?'}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#6366f1'];
export function avatarColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Senha forte e fácil de ditar (sem 0/O, 1/l). */
export function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const values = new Uint32Array(12);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => chars[value % chars.length]).join('');
}
