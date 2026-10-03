/**
 * ============================================================
 * VÓRTICE CRM — Empresa (workspace) do login de cliente
 * ============================================================
 * Contas CLIENT ficam presas à própria empresa (profiles.tenant_id).
 * Aqui o servidor descobre empresa + plano e quais módulos o cliente
 * pode abrir. Contas STAFF (equipe Vórtice) não têm workspace.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { clientModules } from '@/lib/plans';
import type { ClientWorkspace, UserProfile } from '@/types';

export function isClientAccount(profile: Pick<UserProfile, 'account_type'> | null | undefined) {
  return profile?.account_type === 'CLIENT';
}

export async function loadClientWorkspace(profile: UserProfile): Promise<ClientWorkspace | null> {
  if (!isClientAccount(profile) || !profile.tenant_id) return null;

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, status, plan_id')
    .eq('id', profile.tenant_id)
    .maybeSingle();
  if (error || !tenant) return null;

  let planName: string | null = null;
  let modules: string[] = [];
  if (tenant.plan_id) {
    const { data: plan } = await supabaseAdmin
      .from('plans')
      .select('name, modules, active')
      .eq('id', tenant.plan_id)
      .maybeSingle();
    if (plan) {
      planName = plan.name;
      modules = plan.active ? clientModules(plan.modules || []) : [];
    }
  }

  return {
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    tenant_status: tenant.status,
    plan_id: tenant.plan_id ?? null,
    plan_name: planName,
    modules: tenant.status === 'ACTIVE' ? modules : [],
  };
}

/** Perfil devolvido ao navegador: contas CLIENT levam junto empresa e plano. */
export async function withWorkspace(profile: UserProfile): Promise<UserProfile> {
  if (!isClientAccount(profile)) return { ...profile, workspace: null };
  return { ...profile, workspace: await loadClientWorkspace(profile) };
}
