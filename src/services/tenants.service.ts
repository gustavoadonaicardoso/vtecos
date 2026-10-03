/**
 * ============================================================
 * VÓRTICE CRM — Tenants Service
 * ============================================================
 * Empresas (painel Master): plano contratado e usuários de cada empresa.
 * Cada empresa só enxerga os próprios dados (ver migration 202610050001).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

export const TENANT_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;

export interface TenantInput {
  name?: string;
  status?: string;
  plan_id?: string | null;
  document?: string | null;
  contact_email?: string | null;
  notes?: string | null;
}

export function parseTenantInput(body: Record<string, unknown>, partial: boolean): { data: TenantInput } | { error: string } {
  const data: TenantInput = {};
  if ('name' in body || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!name) return { error: 'Nome é obrigatório' };
    data.name = name;
  }
  if ('status' in body) {
    if (!TENANT_STATUSES.includes(body.status as (typeof TENANT_STATUSES)[number])) return { error: 'Status inválido.' };
    data.status = body.status as string;
  }
  if ('plan_id' in body) data.plan_id = typeof body.plan_id === 'string' && body.plan_id ? body.plan_id : null;
  for (const key of ['document', 'contact_email', 'notes'] as const) {
    if (key in body) data[key] = typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, 500) || null : null;
  }
  return { data };
}

export async function fetchTenants(): Promise<ServiceResult<Record<string, unknown>[]>> {
  const [{ data, error }, { data: users }] = await Promise.all([
    supabase.from('tenants').select('*').order('is_platform', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('profiles').select('tenant_id'),
  ]);

  if (error) return { success: false, error: error.message };
  const counts = new Map<string, number>();
  for (const user of users || []) {
    if (user.tenant_id) counts.set(user.tenant_id, (counts.get(user.tenant_id) || 0) + 1);
  }
  return { success: true, data: (data || []).map((tenant) => ({ ...tenant, user_count: counts.get(tenant.id) || 0 })) };
}

export async function fetchTenantById(id: string) {
  const { data } = await supabase.from('tenants').select('id, name, status, plan_id').eq('id', id).maybeSingle();
  return data;
}

export async function createTenant(input: TenantInput): Promise<ServiceResult<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({ status: 'ACTIVE', ...input, is_platform: false })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  // Empresa nova já nasce com o funil padrão (o CRM precisa de etapas).
  const { seedDefaultStages } = await import('@/services/pipeline.service');
  await seedDefaultStages(data.id as string);
  return { success: true, data: { ...data, user_count: 0 } };
}

/** A empresa da plataforma (Vórtice) não pode ser suspensa nem trocar de plano. */
export async function isPlatformTenant(id: string) {
  const { data } = await supabase.from('tenants').select('is_platform').eq('id', id).maybeSingle();
  return Boolean(data?.is_platform);
}

export async function updateTenant(id: string, input: TenantInput): Promise<ServiceResult<Record<string, unknown>>> {
  const { data, error } = await supabase.from('tenants').update(input).eq('id', id).select().maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Empresa não encontrada.' };
  return { success: true, data };
}

export async function fetchTenantUsers(tenantId: string): Promise<ServiceResult<Record<string, unknown>[]>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, status, created_at')
    .eq('tenant_id', tenantId)
    .order('name');
  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}

/** Confere que o perfil é um login de cliente desta empresa. */
export async function fetchTenantUser(tenantId: string, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id, name, email, role, status')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function updateTenantUser(tenantId: string, userId: string, updates: { role?: string; status?: string; name?: string }) {
  const { data, error } = await supabase.from('profiles').update(updates).eq('tenant_id', tenantId).eq('id', userId).select('id, name, email, role, status, created_at').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data };
}
