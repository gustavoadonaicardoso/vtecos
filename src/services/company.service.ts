/**
 * ============================================================
 * VÓRTICE CRM — Dados da empresa (Configurações)
 * ============================================================
 * Cada empresa vê e edita só o próprio cadastro: tudo aqui recebe o
 * tenantId da sessão. O plano é só leitura (quem muda é o Painel Master).
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { PLAN_MODULES, sanitizeModules } from '@/lib/plans';
import type { ServiceResult } from '@/types';

export interface CompanyProfile {
  name: string;
  document: string;
  contact_email: string;
  phone: string;
  website: string;
  address: string;
}

export interface CompanyPlan {
  is_platform: boolean;
  status: string;
  name: string | null;
  price: number | null;
  active: boolean;
  modules: string[];
}

const FIELDS: (keyof CompanyProfile)[] = ['name', 'document', 'contact_email', 'phone', 'website', 'address'];
const LIMITS: Record<keyof CompanyProfile, number> = { name: 120, document: 20, contact_email: 160, phone: 30, website: 200, address: 300 };

export async function fetchCompany(tenantId: string): Promise<ServiceResult<{ company: CompanyProfile; plan: CompanyPlan }>> {
  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!tenant) return { success: false, error: 'Empresa não encontrada.' };

  let plan: CompanyPlan = {
    is_platform: Boolean(tenant.is_platform),
    status: tenant.status,
    name: null,
    price: null,
    active: false,
    modules: tenant.is_platform ? PLAN_MODULES.map((item) => item.key) : [],
  };
  if (!tenant.is_platform && tenant.plan_id) {
    const { data } = await supabaseAdmin.from('plans').select('name, price, modules, active').eq('id', tenant.plan_id).maybeSingle();
    if (data) {
      plan = { ...plan, name: data.name, price: Number(data.price) || 0, active: Boolean(data.active), modules: sanitizeModules(data.modules || []) };
    }
  }

  const company = Object.fromEntries(FIELDS.map((key) => [key, (tenant[key] as string | null) || ''])) as unknown as CompanyProfile;
  return { success: true, data: { company, plan } };
}

/** Valida o formulário: só os campos conhecidos, aparados e com limite. */
export function parseCompanyInput(body: Record<string, unknown>): { data: Partial<CompanyProfile> } | { error: string } {
  const data: Partial<CompanyProfile> = {};
  for (const key of FIELDS) {
    if (!(key in body)) continue;
    const value = typeof body[key] === 'string' ? (body[key] as string).trim().slice(0, LIMITS[key]) : '';
    data[key] = value;
  }
  if ('name' in data && !data.name) return { error: 'Informe o nome da empresa.' };
  if (data.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email)) return { error: 'E-mail de contato inválido.' };
  if (data.website && !/^https?:\/\//i.test(data.website)) data.website = `https://${data.website}`;
  return { data };
}

export async function updateCompany(tenantId: string, input: Partial<CompanyProfile>): Promise<ServiceResult> {
  // Campo vazio vira null no banco (o mesmo que "não informado").
  const row = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, key === 'name' ? value : value || null]));
  const { error } = await supabaseAdmin.from('tenants').update(row).eq('id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
