/**
 * ============================================================
 * VÓRTICE CRM — Plano da empresa: módulos, limites e uso (server-only)
 * ============================================================
 * Usado onde não há sessão (motor das automações, envio de disparos,
 * chamadas de IA) e para os limites do plano:
 *   - usuários ativos (ao criar ou reativar alguém);
 *   - usos da IA da Vórtice por mês (chave própria do Gemini não conta);
 *   - mensagens de disparo por dia (soma de todas as campanhas).
 * null = sem limite; 0 = não incluído. A empresa da plataforma não tem
 * limite. Sem a migration 202610310001 as colunas não existem: tudo
 * fica sem limite, como antes.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { ALL_MODULE_KEYS, NO_LIMITS, limitsOf, sanitizeModules, type PlanLimits } from '@/lib/plans';

export interface TenantPlan {
  isPlatform: boolean;
  planName: string | null;
  modules: string[];
  limits: PlanLimits;
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: TenantPlan }>();

export async function tenantPlan(tenantId: string): Promise<TenantPlan> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { data: tenant } = await db.from('tenants').select('id, status, is_platform, plan_id').eq('id', tenantId).maybeSingle();
  let value: TenantPlan = { isPlatform: false, planName: null, modules: [], limits: NO_LIMITS };
  if (tenant?.is_platform) {
    value = { isPlatform: true, planName: null, modules: ALL_MODULE_KEYS, limits: NO_LIMITS };
  } else if (tenant?.plan_id) {
    const { data: plan } = await db.from('plans').select('*').eq('id', tenant.plan_id).maybeSingle();
    if (plan) {
      value = {
        isPlatform: false,
        planName: plan.name,
        modules: plan.active && tenant.status === 'ACTIVE' ? sanitizeModules(plan.modules || []) : [],
        limits: limitsOf(plan),
      };
    }
  }
  cache.set(tenantId, { at: Date.now(), value });
  return value;
}

/** Depois de mudar o plano de uma empresa (ou um plano): esquece o cache. */
export function forgetTenantPlans(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

export async function tenantHasModule(tenantId: string, key: string) {
  return (await tenantPlan(tenantId)).modules.includes(key);
}

// ── Períodos (horário de Brasília) ───────────────────────────

const spDate = (at = new Date()) => at.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
export const usageMonth = (at = new Date()) => `${spDate(at).slice(0, 7)}-01`;
export const usageDay = (at = new Date()) => spDate(at);

// ── Contador de uso ──────────────────────────────────────────

let warnedMissing = false;

/**
 * Soma 1 ao uso do período, se ainda couber no limite (atômico no banco).
 * Devolve o total depois de somar, ou -1 se o limite já foi atingido.
 */
async function consume(tenantId: string, metric: string, period: string, limit: number | null): Promise<number> {
  const { data, error } = await db.rpc('consume_tenant_usage', { p_tenant: tenantId, p_metric: metric, p_period: period, p_limit: limit });
  if (error) {
    // Sem a migration: não bloqueia ninguém.
    if (!warnedMissing) console.warn('[plano] contador de uso indisponível:', error.message);
    warnedMissing = true;
    return 0;
  }
  return Number(data);
}

export async function usageOf(tenantId: string, metric: string, period: string) {
  const { data } = await db.from('tenant_usage').select('amount').eq('tenant_id', tenantId).eq('metric', metric).eq('period', period).maybeSingle();
  return Number(data?.amount) || 0;
}

async function notifyAdmins(tenantId: string, title: string, content: string) {
  const { data } = await db.from('profiles').select('id').eq('tenant_id', tenantId).eq('role', 'ADMIN').eq('status', 'ACTIVE');
  const rows = (data || []).map((row) => ({ user_id: row.id, type: 'plan', title, content, is_read: false, link: '/settings' }));
  if (rows.length) await db.from('system_notifications').insert(rows);
}

// ── IA ───────────────────────────────────────────────────────

export const AI_NOT_INCLUDED = 'A IA da Vórtice não faz parte do plano da sua empresa. Cadastre a sua própria chave do Gemini em Integrações > Inteligência artificial, ou fale com a Vórtice para mudar de plano.';
export const aiLimitReached = (limit: number) =>
  `A franquia de IA do seu plano (${limit.toLocaleString('pt-BR')} usos por mês) acabou e volta no dia 1º. Para continuar agora, cadastre a sua própria chave do Gemini em Integrações > Inteligência artificial ou fale com a Vórtice para mudar de plano.`;

/** Um uso da IA da Vórtice (chamar só quando a empresa NÃO usa chave própria). */
export async function consumeAi(tenantId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await tenantPlan(tenantId);
  if (plan.isPlatform) return { ok: true };
  const limit = plan.limits.ai_monthly_limit;
  if (limit === 0) return { ok: false, error: AI_NOT_INCLUDED };
  const used = await consume(tenantId, 'ai', usageMonth(), limit);
  if (used === -1) return { ok: false, error: aiLimitReached(limit as number) };
  if (limit !== null && limit >= 10 && used === Math.ceil(limit * 0.8)) {
    await notifyAdmins(tenantId, 'IA: 80% da franquia do mês', `Sua empresa usou ${used} de ${limit} usos de IA deste mês. Ao chegar no limite, a IA para até o dia 1º.`).catch(() => {});
  } else if (limit !== null && used === limit) {
    await notifyAdmins(tenantId, 'IA: franquia do mês acabou', `Sua empresa usou os ${limit} usos de IA do plano neste mês. A IA volta no dia 1º, ou cadastre a sua própria chave do Gemini em Integrações.`).catch(() => {});
  }
  return { ok: true };
}

// ── Usuários ─────────────────────────────────────────────────

/** Cabe mais `extra` usuário(s) ativo(s)? (ao criar ou reativar) */
export async function checkUserSlots(tenantId: string, extra = 1): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await tenantPlan(tenantId);
  const max = plan.limits.max_users;
  if (plan.isPlatform || max === null) return { ok: true };
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'ACTIVE');
  if ((count || 0) + extra <= max) return { ok: true };
  return { ok: false, error: `O plano da sua empresa permite até ${max} usuário${max === 1 ? '' : 's'} ativo${max === 1 ? '' : 's'}. Desative alguém em Equipe ou fale com a Vórtice para mudar de plano.` };
}

// ── Disparos ─────────────────────────────────────────────────

/** Quantas mensagens de disparo a empresa ainda pode mandar hoje (null = sem limite). */
export async function blastsLeftToday(tenantId: string, sentToday: number): Promise<number | null> {
  const plan = await tenantPlan(tenantId);
  const limit = plan.limits.blast_daily_limit;
  if (plan.isPlatform || limit === null) return null;
  return Math.max(0, limit - sentToday);
}

// ── Resumo para a tela de Configurações ──────────────────────

export interface PlanUsage {
  limits: PlanLimits;
  users: number;
  aiThisMonth: number;
  blastsToday: number;
}

export async function planUsage(tenantId: string, startOfToday: Date): Promise<PlanUsage> {
  const [plan, users, ai, blasts] = await Promise.all([
    tenantPlan(tenantId),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'ACTIVE'),
    usageOf(tenantId, 'ai', usageMonth()).catch(() => 0),
    db.from('blast_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['sent', 'sending']).gte('sent_at', startOfToday.toISOString()),
  ]);
  return { limits: plan.limits, users: users.count || 0, aiThisMonth: ai, blastsToday: blasts.count || 0 };
}
