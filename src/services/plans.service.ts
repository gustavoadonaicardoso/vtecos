/**
 * ============================================================
 * VÓRTICE CRM — Planos de assinatura (painel Master)
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sanitizeModules } from '@/lib/plans';
import type { ServiceResult } from '@/types';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  modules: string[];
  active: boolean;
  created_at: string;
  tenant_count?: number;
}

export interface PlanInput {
  name: string;
  description: string;
  price: number;
  modules: string[];
  active: boolean;
}

export function parsePlanInput(body: Record<string, unknown>): { data: PlanInput } | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return { error: 'Dê um nome ao plano.' };
  const price = Number(body.price ?? 0);
  if (!Number.isFinite(price) || price < 0) return { error: 'Preço inválido.' };
  return {
    data: {
      name,
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '',
      price: Math.round(price * 100) / 100,
      modules: sanitizeModules(body.modules),
      active: body.active !== false,
    },
  };
}

export async function listPlans(): Promise<ServiceResult<Plan[]>> {
  const [{ data, error }, { data: tenants }] = await Promise.all([
    supabaseAdmin.from('plans').select('*').order('price', { ascending: true }),
    supabaseAdmin.from('tenants').select('plan_id'),
  ]);
  if (error) return { success: false, error: error.message };

  const counts = new Map<string, number>();
  for (const tenant of tenants || []) {
    if (tenant.plan_id) counts.set(tenant.plan_id, (counts.get(tenant.plan_id) || 0) + 1);
  }
  return {
    success: true,
    data: (data || []).map((plan) => ({ ...plan, price: Number(plan.price), tenant_count: counts.get(plan.id) || 0 })),
  };
}

export async function createPlan(input: PlanInput): Promise<ServiceResult<Plan>> {
  const { data, error } = await supabaseAdmin.from('plans').insert(input).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: { ...data, price: Number(data.price) } };
}

export async function updatePlan(id: string, input: PlanInput): Promise<ServiceResult<Plan>> {
  const { data, error } = await supabaseAdmin
    .from('plans')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Plano não encontrado.' };
  return { success: true, data: { ...data, price: Number(data.price) } };
}

/** Empresas no plano excluído ficam sem plano (on delete set null). */
export async function deletePlan(id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from('plans').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
