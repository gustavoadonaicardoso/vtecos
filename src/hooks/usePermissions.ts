/**
 * ============================================================
 * VÓRTICE CRM — Hook de Permissões
 * ============================================================
 * Centraliza a lógica de verificação de permissões de rota e
 * ação. Evita duplicação entre RootLayoutContent e Sidebar.
 *
 * Movido de src/lib/permissions.ts para src/hooks/ pois contém
 * um hook React (usePermissions) e não deve ficar em lib/.
 * ============================================================
 */

import { useAuth } from '@/context/AuthContext';
import type { UserPermissions } from '@/types';

export { ROUTE_PERMISSIONS } from '@/lib/permissions.constants';

export function usePermissions() {
  const { user } = useAuth();

  /**
   * Verifica se o usuário tem permissão para uma rota/ação específica.
   * @param permissionPath ex: 'dashboard.view', 'admin.settings'
   */
  const hasPermission = (permissionPath?: string): boolean => {
    if (!permissionPath) return true;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    const [category, field] = permissionPath.split('.') as [string, string];

    // Fallback: se permissões não configuradas, não trava o sistema
    if (!user.permissions || Object.keys(user.permissions).length === 0) return true;

    return (user.permissions as any)?.[category]?.[field] === true;
  };

  const isAdmin = user?.role === 'ADMIN';

  return { hasPermission, isAdmin, user };
}
