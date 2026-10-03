/**
 * Custos & Precificação — quem pode abrir a planilha de qual empresa.
 *
 * - Login de cliente (CLIENT): sempre a própria empresa (profiles.tenant_id),
 *   que precisa estar ATIVA e com o módulo "financeiro" no plano. O
 *   `?tenant=` da URL é ignorado -- não dá pra pedir a empresa de outro.
 * - Equipe Vórtice (STAFF) com permissão financeiro.view: escolhe a empresa
 *   cliente pelo `?tenant=` (para ajudar a montar a planilha).
 * Editar cadastros: ADMIN/MANAGER. Registrar vendas: também o operador
 * (SELLER) do cliente.
 */

import { requireActiveProfile } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadClientWorkspace } from '@/services/workspace.service';
import type { UserProfile } from '@/types';

export interface FinanceAccess {
  profile: UserProfile;
  tenant: { id: string; name: string };
  canManage: boolean;
  canSell: boolean;
  isClient: boolean;
}

type AccessResult = { access: FinanceAccess } | { error: { message: string; status: number } };

function staffHasPermission(profile: UserProfile, path: string) {
  if (profile.role === 'ADMIN') return true;
  const permissions = profile.permissions as Record<string, Record<string, boolean>> | undefined;
  if (!permissions || Object.keys(permissions).length === 0) return true;
  const [category, field] = path.split('.');
  return permissions?.[category]?.[field] === true;
}

export async function requireFinanceAccess(request: Request, need: 'view' | 'manage' | 'sell' = 'view'): Promise<AccessResult> {
  const auth = await requireActiveProfile({ allowClient: true });
  if ('error' in auth) return auth;
  const { profile } = auth;
  const isClient = profile.account_type === 'CLIENT';

  let tenant: { id: string; name: string };
  if (isClient) {
    const workspace = await loadClientWorkspace(profile);
    if (!workspace) return { error: { message: 'Sua conta não está vinculada a uma empresa.', status: 403 } };
    if (workspace.tenant_status !== 'ACTIVE') return { error: { message: 'O acesso da sua empresa está suspenso. Fale com a Vórtice.', status: 403 } };
    if (!workspace.modules.includes('financeiro')) return { error: { message: 'O plano da sua empresa não inclui Custos e Precificação.', status: 403 } };
    tenant = { id: workspace.tenant_id, name: workspace.tenant_name };
  } else {
    if (!staffHasPermission(profile, 'financeiro.view')) {
      return { error: { message: 'Sem permissão para Custos e Precificação.', status: 403 } };
    }
    const tenantId = new URL(request.url).searchParams.get('tenant') || '';
    if (!tenantId) return { error: { message: 'Escolha a empresa cliente.', status: 400 } };
    const { data } = await supabaseAdmin.from('tenants').select('id, name').eq('id', tenantId).maybeSingle();
    if (!data) return { error: { message: 'Empresa não encontrada.', status: 404 } };
    tenant = data;
  }

  const canManage = ['ADMIN', 'MANAGER'].includes(profile.role);
  const canSell = canManage || isClient;
  if (need === 'manage' && !canManage) return { error: { message: 'Seu perfil só pode consultar esta área.', status: 403 } };
  if (need === 'sell' && !canSell) return { error: { message: 'Seu perfil não pode registrar vendas.', status: 403 } };

  return { access: { profile, tenant, canManage, canSell, isClient } };
}
