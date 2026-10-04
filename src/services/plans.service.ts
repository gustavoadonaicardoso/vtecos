/**
 * ============================================================
 * VÓRTICE CRM — Planos de assinatura (painel Master)
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { PLAN_MODULES, sanitizeModules } from '@/lib/plans';
import type { ServiceResult } from '@/types';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  modules: string[];
  active: boolean;
  show_on_login?: boolean;
  featured?: boolean;
  created_at: string;
  tenant_count?: number;
}

export interface PlanInput {
  name: string;
  description: string;
  price: number;
  modules: string[];
  active: boolean;
  show_on_login: boolean;
  featured: boolean;
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
      show_on_login: body.show_on_login !== false,
      featured: body.featured === true,
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

// Sem a migration 202610070001 as colunas da tela de login não existem:
// grava o resto do plano em vez de falhar.
const missingLoginColumns = (message?: string) => Boolean(message && /show_on_login|featured/.test(message));
const withoutLoginFields = (input: PlanInput): Partial<PlanInput> => {
  const rest: Partial<PlanInput> = { ...input };
  delete rest.show_on_login;
  delete rest.featured;
  return rest;
};

export async function createPlan(input: PlanInput): Promise<ServiceResult<Plan>> {
  let { data, error } = await supabaseAdmin.from('plans').insert(input).select().single();
  if (error && missingLoginColumns(error.message)) {
    ({ data, error } = await supabaseAdmin.from('plans').insert(withoutLoginFields(input)).select().single());
  }
  if (error) return { success: false, error: error.message };
  return { success: true, data: { ...data, price: Number(data.price) } };
}

export async function updatePlan(id: string, input: PlanInput): Promise<ServiceResult<Plan>> {
  const run = (row: Partial<PlanInput>) => supabaseAdmin
    .from('plans')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  let { data, error } = await run(input);
  if (error && missingLoginColumns(error.message)) ({ data, error } = await run(withoutLoginFields(input)));
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

export interface PublicPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  featured: boolean;
  modules: { key: string; label: string; description: string }[];
}

export interface SalesContact {
  whatsapp: string | null;
  email: string | null;
  website: string | null;
}

/**
 * Planos da tela de login (público, sem sessão): só os ativos marcados
 * para aparecer, sem contagem de empresas nem nada interno.
 */
export async function listPublicPlans(): Promise<PublicPlan[]> {
  const { data, error } = await supabaseAdmin.from('plans').select('*').eq('active', true).order('price', { ascending: true });
  if (error || !data) return [];
  return data
    .filter((plan) => plan.show_on_login !== false)
    .map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description || '',
      price: Number(plan.price) || 0,
      featured: plan.featured === true,
      modules: sanitizeModules(plan.modules || []).map((key) => {
        const item = PLAN_MODULES.find((module) => module.key === key)!;
        return { key, label: item.label, description: item.description };
      }),
    }));
}

/** Contato comercial: telefone, e-mail e site da empresa da plataforma (Configurações > Empresa). */
export async function fetchSalesContact(): Promise<SalesContact> {
  // tenant-scope: ok (dados públicos de contato da empresa dona da plataforma)
  const { data } = await supabaseAdmin.from('tenants').select('*').eq('is_platform', true).maybeSingle();
  const digits = String(data?.phone || '').replace(/\D/g, '');
  const whatsapp = digits.length >= 12 ? digits : digits.length >= 10 ? `55${digits}` : null;
  return {
    whatsapp,
    email: (data?.contact_email as string) || null,
    website: (data?.website as string) || null,
  };
}
