/**
 * Custos & Precificação — quem pode abrir a planilha de qual empresa.
 *
 * - Todo usuário abre a planilha da própria empresa (profiles.tenant_id),
 *   que precisa estar ATIVA e com o módulo "financeiro" no plano. O
 *   `?tenant=` da URL é ignorado -- não dá pra pedir a empresa de outro.
 * - Exceção: a equipe da plataforma (Vórtice) pode escolher uma empresa
 *   cliente pelo `?tenant=` para ajudar a montar a planilha.
 * Editar cadastros: ADMIN/MANAGER. Registrar vendas: também o operador
 * (SELLER) do cliente.
 */

import { requireActiveProfile } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
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
  const auth = await requireActiveProfile({ module: 'financeiro' });
  if ('error' in auth) return auth;
  const { profile } = auth;
  const isClient = !auth.isPlatform;

  let tenant = { id: auth.tenantId, name: auth.tenantName };
  if (!staffHasPermission(profile, 'financeiro.view')) {
    return { error: { message: 'Sem permissão para Custos e Precificação.', status: 403 } };
  }

  // Equipe da plataforma pode abrir a planilha de uma empresa cliente
  // (suporte). Qualquer outra empresa fica presa à própria.
  const requested = new URL(request.url).searchParams.get('tenant') || '';
  if (auth.isPlatform && requested && requested !== auth.tenantId) {
    const { data } = await supabaseAdmin.from('tenants').select('id, name').eq('id', requested).maybeSingle();
    if (!data) return { error: { message: 'Empresa não encontrada.', status: 404 } };
    tenant = data;
  }

  const canManage = ['ADMIN', 'MANAGER'].includes(profile.role);
  const canSell = canManage || isClient;
  if (need === 'manage' && !canManage) return { error: { message: 'Seu perfil só pode consultar esta área.', status: 403 } };
  if (need === 'sell' && !canSell) return { error: { message: 'Seu perfil não pode registrar vendas.', status: 403 } };

  return { access: { profile, tenant, canManage, canSell, isClient } };
}
