/**
 * ============================================================
 * VÓRTICE CRM — Empresa (workspace) de quem está logado
 * ============================================================
 * Todo usuário pertence a uma empresa (profiles.tenant_id). Aqui o
 * servidor descobre empresa + plano e quais módulos ela pode abrir.
 * A empresa da plataforma (Vórtice) tem todos os módulos.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { ALL_MODULE_KEYS, sanitizeModules } from '@/lib/plans';
import type { ClientWorkspace, UserProfile } from '@/types';

export function isClientAccount(profile: Pick<UserProfile, 'account_type'> | null | undefined) {
  return profile?.account_type === 'CLIENT';
}

export async function loadWorkspace(profile: Pick<UserProfile, 'tenant_id'>): Promise<ClientWorkspace | null> {
  if (!profile.tenant_id) return null;

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, status, plan_id, is_platform')
    .eq('id', profile.tenant_id)
    .maybeSingle();
  if (error || !tenant) return null;

  let planName: string | null = null;
  let modules: string[] = [];
  if (tenant.is_platform) {
    modules = ALL_MODULE_KEYS;
  } else if (tenant.plan_id) {
    const { data: plan } = await supabaseAdmin.from('plans').select('name, modules, active').eq('id', tenant.plan_id).maybeSingle();
    if (plan) {
      planName = plan.name;
      modules = plan.active ? sanitizeModules(plan.modules || []) : [];
    }
  }

  const active = tenant.is_platform || tenant.status === 'ACTIVE';
  return {
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    tenant_status: tenant.status,
    is_platform: Boolean(tenant.is_platform),
    plan_id: tenant.plan_id ?? null,
    plan_name: planName,
    modules: active ? modules : [],
  };
}

/** @deprecated use loadWorkspace -- mantido para o módulo financeiro. */
export const loadClientWorkspace = loadWorkspace;

/** Perfil devolvido ao navegador, com a empresa e o plano. */
export async function withWorkspace(profile: UserProfile): Promise<UserProfile> {
  return { ...profile, workspace: await loadWorkspace(profile) };
}
