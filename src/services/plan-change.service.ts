/**
 * ============================================================
 * VTEC OS — Troca de plano pelo próprio cliente
 * ============================================================
 * Configurações > Plano (administrador da empresa):
 *  - no teste grátis: troca na hora (a primeira fatura muda de valor);
 *  - subir de plano: módulos novos na hora, a fatura em aberto passa a
 *    cobrar o valor novo;
 *  - descer de plano: a fatura em aberto já vem com o valor novo, mas os
 *    módulos continuam até o vencimento dela (o período já pago); a
 *    rotina da cobrança troca o plano nesse dia.
 *  - mudar só o ciclo (mensal/anual): vale a partir da fatura em aberto.
 * Fatura atrasada, suspensa ou cobrança manual: não troca por aqui.
 * A troca agendada fica em integrations_config da empresa, provider
 * "plan_change": { plan_id, cycle, previous_cycle, effective_on }.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { asaas, AsaasError } from '@/lib/asaas';
import { forgetTenantPlans } from '@/lib/plan-limits';
import { PLAN_MODULES, limitsOf, sanitizeModules } from '@/lib/plans';
import { changeMode, cyclePrice, type Cycle, type PlanChangeView, type PlanOption } from '@/lib/plan-change';
import { brDate, cycleLabel, notifyPlatform, notifyTenantAdmins, reconcileTenant, todaySP } from '@/services/billing.service';

type Row = Record<string, unknown>;
const PROVIDER = 'plan_change';

interface StoredChange {
  plan_id: string;
  cycle: Cycle;
  previous_cycle: Cycle;
  effective_on: string;
  requested_at: string;
  requested_by?: string;
}

const asCycle = (value: unknown): Cycle => (value === 'YEARLY' ? 'YEARLY' : 'MONTHLY');

async function loadTenant(tenantId: string) {
  const { data } = await db
    .from('tenants')
    .select('id, name, status, plan_id, is_platform, billing_status, billing_cycle, billing_next_due, asaas_subscription_id')
    .eq('id', tenantId)
    .maybeSingle();
  return (data as Row) || null;
}

async function loadStored(tenantId: string): Promise<StoredChange | null> {
  const { data } = await db.from('integrations_config').select('config').eq('tenant_id', tenantId).eq('provider', PROVIDER).maybeSingle();
  const config = data?.config as StoredChange | undefined;
  return config && config.plan_id ? config : null;
}

async function saveStored(tenantId: string, change: StoredChange) {
  await db.from('integrations_config').upsert(
    { tenant_id: tenantId, provider: PROVIDER, config: change, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,provider' },
  );
}

/** Esquece a troca agendada (o Master mudou o plano, a cobrança foi desligada...). */
export async function clearPendingPlanChange(tenantId: string) {
  await db.from('integrations_config').delete().eq('tenant_id', tenantId).eq('provider', PROVIDER);
}

async function activeUsers(tenantId: string) {
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'ACTIVE');
  return count || 0;
}

async function planOptions(currentPlanId: string | null): Promise<PlanOption[]> {
  const { data } = await db.from('plans').select('*').eq('active', true).order('price', { ascending: true });
  return ((data || []) as Row[])
    .filter((plan) => plan.id === currentPlanId || (plan.show_on_login !== false && Number(plan.price) >= 5))
    .map((plan) => ({
      id: String(plan.id),
      name: String(plan.name),
      description: String(plan.description || ''),
      price: Number(plan.price) || 0,
      featured: plan.featured === true,
      modules: sanitizeModules((plan.modules as string[]) || []).map((key) => ({ key, label: PLAN_MODULES.find((module) => module.key === key)?.label || key })),
      maxUsers: limitsOf(plan).max_users,
      current: plan.id === currentPlanId,
    }));
}

function blockedReason(tenant: Row): string | null {
  if (tenant.is_platform) return 'A empresa da plataforma não tem plano.';
  const status = String(tenant.billing_status || 'manual');
  if (status === 'past_due') return 'Há uma fatura em atraso. Pague a fatura em aberto para poder trocar de plano.';
  if (status === 'suspended') return 'O acesso está suspenso por falta de pagamento. Pague a fatura em aberto para liberar e depois troque de plano.';
  if (status === 'manual' || status === 'canceled' || !tenant.asaas_subscription_id) return 'A cobrança da sua empresa é feita diretamente com a Vórtice: fale com a gente para mudar de plano.';
  return null;
}

export async function planChangeView(tenantId: string): Promise<PlanChangeView | null> {
  const tenant = await loadTenant(tenantId);
  if (!tenant) return null;
  const currentPlanId = tenant.plan_id ? String(tenant.plan_id) : null;
  const [options, users, stored] = await Promise.all([planOptions(currentPlanId), activeUsers(tenantId), loadStored(tenantId)]);
  const reason = blockedReason(tenant);
  const pendingPlan = stored ? options.find((option) => option.id === stored.plan_id) : null;
  return {
    allowed: !reason,
    reason,
    status: String(tenant.billing_status || 'manual'),
    currentPlanId,
    cycle: asCycle(tenant.billing_cycle),
    nextDue: (tenant.billing_next_due as string) || null,
    activeUsers: users,
    pending: stored && pendingPlan ? { planId: stored.plan_id, planName: pendingPlan.name, cycle: stored.cycle, effectiveOn: stored.effective_on } : null,
    options,
  };
}

export type PlanChangeResult =
  | { ok: true; mode: 'now' | 'next_invoice'; effectiveOn: string | null; planName: string; value: number; cycle: Cycle }
  | { ok: false; status: number; error: string };

export async function requestPlanChange(tenantId: string, input: { planId: unknown; cycle: unknown }, actor?: { id: string; name: string }, now = new Date()): Promise<PlanChangeResult> {
  const tenant = await loadTenant(tenantId);
  if (!tenant) return { ok: false, status: 404, error: 'Empresa não encontrada.' };
  const reason = blockedReason(tenant);
  if (reason) return { ok: false, status: 409, error: reason };

  const planId = typeof input.planId === 'string' ? input.planId : '';
  const cycle = asCycle(input.cycle);
  const currentPlanId = tenant.plan_id ? String(tenant.plan_id) : null;
  const currentCycle = asCycle(tenant.billing_cycle);
  const options = await planOptions(currentPlanId);
  const target = options.find((option) => option.id === planId);
  if (!target) return { ok: false, status: 400, error: 'Escolha um dos planos disponíveis.' };
  const current = options.find((option) => option.current) || null;
  const stored = await loadStored(tenantId);
  const sameAsNow = planId === currentPlanId && cycle === currentCycle;
  if (sameAsNow && !stored) return { ok: false, status: 400, error: 'Esse já é o seu plano.' };
  if (sameAsNow && stored) return cancelPendingPlanChange(tenantId, actor);

  const users = await activeUsers(tenantId);
  if (target.maxUsers !== null && users > target.maxUsers) {
    return { ok: false, status: 409, error: `O plano ${target.name} permite até ${target.maxUsers} usuário${target.maxUsers === 1 ? '' : 's'} ativo${target.maxUsers === 1 ? '' : 's'}, e hoje vocês têm ${users}. Desative alguém em Equipe antes de trocar.` };
  }

  const value = cyclePrice(target.price, cycle);
  try {
    await asaas.updateSubscription(String(tenant.asaas_subscription_id), {
      value,
      cycle,
      description: `vtec os - plano ${target.name} (${cycleLabel(cycle)})`,
    });
  } catch (error) {
    return { ok: false, status: 502, error: error instanceof AsaasError ? `O Asaas recusou a troca: ${error.message}` : 'Não foi possível atualizar a cobrança agora. Tente de novo em instantes.' };
  }

  const today = todaySP(now);
  const mode = planId === currentPlanId ? 'now' : changeMode(String(tenant.billing_status), current?.price ?? 0, target.price);
  const effectiveOn = mode === 'next_invoice' ? String(tenant.billing_next_due || today) : null;
  if (mode === 'next_invoice' && effectiveOn! > today) {
    await db.from('tenants').update({ billing_cycle: cycle }).eq('id', tenantId);
    await saveStored(tenantId, { plan_id: planId, cycle, previous_cycle: stored?.previous_cycle || currentCycle, effective_on: effectiveOn!, requested_at: now.toISOString(), requested_by: actor?.id });
  } else {
    await db.from('tenants').update({ plan_id: planId, billing_cycle: cycle }).eq('id', tenantId);
    await clearPendingPlanChange(tenantId);
    forgetTenantPlans(tenantId);
  }
  await reconcileTenant(tenantId, now).catch(() => null);

  const when = mode === 'next_invoice' && effectiveOn! > today ? `a partir de ${brDate(effectiveOn!)}` : 'na hora';
  await notifyPlatform('Cliente mudou de plano', `${tenant.name}: ${current?.name || 'sem plano'} (${cycleLabel(currentCycle)}) → ${target.name} (${cycleLabel(cycle)}), ${when}. Pedido por ${actor?.name || 'um administrador'}.`).catch(() => {});
  return { ok: true, mode: mode === 'next_invoice' && effectiveOn! > today ? 'next_invoice' : 'now', effectiveOn: mode === 'next_invoice' && effectiveOn! > today ? effectiveOn : null, planName: target.name, value, cycle };
}

/** Desiste da troca agendada: a cobrança volta ao plano e ciclo atuais. */
export async function cancelPendingPlanChange(tenantId: string, actor?: { id: string; name: string }): Promise<PlanChangeResult> {
  const tenant = await loadTenant(tenantId);
  const stored = await loadStored(tenantId);
  if (!tenant || !stored) return { ok: false, status: 404, error: 'Não há troca de plano agendada.' };
  const options = await planOptions(tenant.plan_id ? String(tenant.plan_id) : null);
  const current = options.find((option) => option.current);
  if (!current) return { ok: false, status: 409, error: 'O plano atual não está mais disponível. Fale com a Vórtice.' };
  const cycle = stored.previous_cycle;
  const value = cyclePrice(current.price, cycle);
  if (tenant.asaas_subscription_id) {
    try {
      await asaas.updateSubscription(String(tenant.asaas_subscription_id), { value, cycle, description: `vtec os - plano ${current.name} (${cycleLabel(cycle)})` });
    } catch (error) {
      return { ok: false, status: 502, error: error instanceof AsaasError ? `O Asaas recusou: ${error.message}` : 'Não foi possível atualizar a cobrança agora.' };
    }
  }
  await db.from('tenants').update({ billing_cycle: cycle }).eq('id', tenantId);
  await clearPendingPlanChange(tenantId);
  await reconcileTenant(tenantId).catch(() => null);
  await notifyPlatform('Troca de plano cancelada', `${tenant.name} desistiu de mudar para outro plano e segue no ${current.name}. Pedido por ${actor?.name || 'um administrador'}.`).catch(() => {});
  return { ok: true, mode: 'now', effectiveOn: null, planName: current.name, value, cycle };
}

/** Rotina da cobrança: aplica as trocas (descidas de plano) que chegaram na data. */
export async function applyScheduledPlanChanges(now = new Date()): Promise<number> {
  const today = todaySP(now);
  // tenant-scope: ok (rotina da plataforma: trocas agendadas de todas as empresas)
  const { data } = await db.from('integrations_config').select('tenant_id, config').eq('provider', PROVIDER).limit(500);
  let applied = 0;
  for (const row of (data || []) as Row[]) {
    const tenantId = String(row.tenant_id);
    const change = row.config as StoredChange | null;
    if (!change?.plan_id || !change.effective_on || change.effective_on > today) continue;
    const tenant = await loadTenant(tenantId);
    if (!tenant || !['active', 'past_due', 'trial'].includes(String(tenant.billing_status))) {
      await clearPendingPlanChange(tenantId);
      continue;
    }
    const { data: plan } = await db.from('plans').select('id, name, active').eq('id', change.plan_id).maybeSingle();
    if (!plan?.active) {
      await clearPendingPlanChange(tenantId);
      await notifyPlatform('Troca de plano não aplicada', `${tenant.name}: o plano escolhido não está mais ativo. Confira a cobrança no Painel Master.`).catch(() => {});
      continue;
    }
    await db.from('tenants').update({ plan_id: change.plan_id }).eq('id', tenantId);
    await clearPendingPlanChange(tenantId);
    forgetTenantPlans(tenantId);
    await notifyTenantAdmins(tenantId, 'Plano alterado', `A partir de hoje a empresa está no plano ${plan.name}, como vocês pediram.`).catch(() => {});
    applied++;
  }
  return applied;
}
