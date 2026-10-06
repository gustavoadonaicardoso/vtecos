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

import { profileHasPermission } from '@/lib/permissions.constants';

export { ROUTE_PERMISSIONS } from '@/lib/permissions.constants';

export function usePermissions() {
  const { user } = useAuth();

  /**
   * Verifica se o usuário tem permissão para uma rota/ação específica.
   * @param permissionPath ex: 'dashboard.view', 'admin.settings'
   */
  /**
   * Verifica se o usuário tem permissão para uma rota/ação específica.
   * Mesma regra do servidor (profileHasPermission): admin pode tudo.
   * @param permissionPath ex: 'dashboard.view', 'admin.settings'
   */
  const hasPermission = (permissionPath?: string): boolean => {
    if (!permissionPath) return true;
    return profileHasPermission(user, permissionPath);
  };

  // Admin da própria empresa (equipe, integrações, configurações).
  const isAdmin = user?.role === 'ADMIN';
  // Admin da empresa dona da plataforma: Painel Master (empresas, planos).
  const isPlatformAdmin = isAdmin && Boolean(user?.workspace?.is_platform);

  return { hasPermission, isAdmin, isPlatformAdmin, user };
}
