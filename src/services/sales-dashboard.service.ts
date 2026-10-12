/**
 * ============================================================
 * VTEC OS — Painel Master > Vendas
 * ============================================================
 * Números da Vórtice como empresa de software: receita recorrente
 * (MRR), testes grátis e conversão, inadimplência, cancelamentos e o
 * que entrou por mês. Tudo do banco, sem chamar o Asaas:
 *  - MRR: empresas com cobrança automática em dia ou em atraso (anual
 *    vira 1/12) + empresas de cobrança manual ativas (preço do plano);
 *  - recebido: avisos de pagamento do Asaas (billing_events), um por
 *    cobrança, sem as estornadas -- conta a partir do webhook ligado.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import type { SalesDashboard } from '@/lib/sales-dashboard';
import { addDays, todaySP } from '@/services/billing.service';

type Row = Record<string, unknown>;
const CONVERSION_WINDOW_DAYS = 90;
const MONTHS = 6;
const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'];
const UNDONE_EVENTS = /REFUND|CHARGEBACK|PAYMENT_DELETED|PAYMENT_RECEIVED_IN_CASH_UNDONE/;
const MONTH_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const round = (value: number) => Math.round(value * 100) / 100;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const monthOf = (iso: string) => todaySP(new Date(iso)).slice(0, 7);

/** Mensalidade equivalente do plano no ciclo (anual = 10 meses pagos em 12). */
export function monthlyValue(price: number, cycle: unknown) {
  return round(cycle === 'YEARLY' ? (price * 10) / 12 : price);
}

function lastMonths(today: string, count: number) {
  const [year, month] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function salesDashboard(now = new Date(), deps: { onboarding?: (tenantId: string, modules: string[] | null) => Promise<{ done: number; total: number } | null> } = {}): Promise<SalesDashboard> {
  const today = todaySP(now);
  // tenant-scope: ok (painel da plataforma: soma todas as empresas)
  const { data: tenantRows } = await db
    .from('tenants')
    .select('id, name, status, plan_id, created_at, is_platform, billing_status, billing_cycle, trial_ends_at, billing_overdue_since, billing_invoice_url, billing_last_paid_at')
    .eq('is_platform', false);
  const tenants = (tenantRows || []) as Row[];
  const { data: planRows } = await db.from('plans').select('id, name, price, modules');
  const plans = new Map(((planRows || []) as Row[]).map((plan) => [String(plan.id), plan]));
  const planOf = (tenant: Row) => (tenant.plan_id ? plans.get(String(tenant.plan_id)) : undefined);
  const priceOf = (tenant: Row) => Number(planOf(tenant)?.price) || 0;
  const names = new Map(tenants.map((tenant) => [String(tenant.id), String(tenant.name)]));

  // ── MRR
  let automatic = 0;
  let manual = 0;
  let paying = 0;
  const byPlan = new Map<string, { plan: string; customers: number; mrr: number }>();
  for (const tenant of tenants) {
    const status = String(tenant.billing_status || 'manual');
    let value = 0;
    if (status === 'active' || status === 'past_due') value = monthlyValue(priceOf(tenant), tenant.billing_cycle);
    else if (status === 'manual' && tenant.status === 'ACTIVE') value = priceOf(tenant);
    if (value <= 0) continue;
    if (status === 'manual') manual += value;
    else automatic += value;
    paying++;
    const planName = String(planOf(tenant)?.name || 'Sem plano');
    const entry = byPlan.get(planName) || { plan: planName, customers: 0, mrr: 0 };
    entry.customers++;
    entry.mrr = round(entry.mrr + value);
    byPlan.set(planName, entry);
  }
  const total = round(automatic + manual);

  // ── Testes em andamento
  const trialRows = tenants
    .filter((tenant) => tenant.billing_status === 'trial' && tenant.trial_ends_at)
    .map((tenant) => {
      const endsOn = todaySP(new Date(String(tenant.trial_ends_at)));
      return { tenant, endsOn, daysLeft: daysBetween(today, endsOn) };
    })
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn));
  const onboarding = deps.onboarding || (async (tenantId: string, modules: string[] | null) => {
    const { onboardingProgress } = await import('@/services/onboarding.service');
    const view = await onboardingProgress(tenantId, modules);
    return { done: view.done, total: view.total };
  });
  const trialList = await Promise.all(trialRows.slice(0, 50).map(async ({ tenant, endsOn, daysLeft }) => {
    const plan = planOf(tenant);
    const progress = await onboarding(String(tenant.id), Array.isArray(plan?.modules) ? (plan!.modules as string[]) : null).catch(() => null);
    return {
      id: String(tenant.id),
      name: String(tenant.name),
      plan: plan ? String(plan.name) : null,
      endsOn,
      daysLeft,
      onboardingDone: progress?.done ?? null,
      onboardingTotal: progress?.total ?? null,
    };
  }));

  // ── Conversão: testes que terminaram nos últimos 90 dias
  const windowStart = addDays(today, -CONVERSION_WINDOW_DAYS);
  const ended = tenants.filter((tenant) => {
    if (!tenant.trial_ends_at) return false;
    const endsOn = todaySP(new Date(String(tenant.trial_ends_at)));
    return endsOn < today && endsOn >= windowStart;
  });
  const converted = ended.filter((tenant) => tenant.billing_last_paid_at || tenant.billing_status === 'active').length;

  // ── Inadimplência e cancelamentos
  const overdueList = tenants
    .filter((tenant) => tenant.billing_status === 'past_due' || tenant.billing_status === 'suspended')
    .map((tenant) => ({
      id: String(tenant.id),
      name: String(tenant.name),
      status: tenant.billing_status as 'past_due' | 'suspended',
      since: (tenant.billing_overdue_since as string) || null,
      value: round(tenant.billing_cycle === 'YEARLY' ? priceOf(tenant) * 10 : priceOf(tenant)),
      invoiceUrl: (tenant.billing_invoice_url as string) || null,
    }))
    .sort((a, b) => String(a.since || '').localeCompare(String(b.since || '')));
  const sum = (status: string) => {
    const items = overdueList.filter((item) => item.status === status);
    return { count: items.length, value: round(items.reduce((acc, item) => acc + item.value, 0)) };
  };
  const canceledList = tenants
    .filter((tenant) => tenant.billing_status === 'canceled')
    .map((tenant) => ({ id: String(tenant.id), name: String(tenant.name), plan: planOf(tenant) ? String(planOf(tenant)!.name) : null }));

  // ── Pagamentos (avisos do Asaas)
  const months = lastMonths(today, MONTHS);
  const since = `${months[0]}-01T00:00:00-03:00`;
  // tenant-scope: ok (painel da plataforma: pagamentos de todas as empresas)
  const { data: eventRows } = await db
    .from('billing_events')
    .select('tenant_id, event, payment_id, payload, created_at')
    .gte('created_at', new Date(Date.parse(since) - 40 * 86_400_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(5000);
  const undone = new Set<string>();
  const payments = new Map<string, { tenantId: string | null; value: number; paidAt: string; billingType: string | null }>();
  for (const event of (eventRows || []) as Row[]) {
    const paymentId = event.payment_id ? String(event.payment_id) : null;
    if (!paymentId) continue;
    const name = String(event.event);
    if (UNDONE_EVENTS.test(name)) {
      undone.add(paymentId);
      continue;
    }
    if (!PAID_EVENTS.includes(name) || payments.has(paymentId)) continue;
    const payment = ((event.payload as Row)?.payment as Row) || {};
    const date = String(payment.clientPaymentDate || payment.paymentDate || payment.confirmedDate || '').slice(0, 10);
    payments.set(paymentId, {
      tenantId: event.tenant_id ? String(event.tenant_id) : null,
      value: Number(payment.value) || 0,
      paidAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todaySP(new Date(String(event.created_at))),
      billingType: payment.billingType ? String(payment.billingType) : null,
    });
  }
  const paid = [...payments.entries()].filter(([id]) => !undone.has(id)).map(([, payment]) => payment);

  const firstPaid = new Map<string, string>();
  for (const payment of [...paid].sort((a, b) => a.paidAt.localeCompare(b.paidAt))) {
    if (payment.tenantId && !firstPaid.has(payment.tenantId)) firstPaid.set(payment.tenantId, payment.paidAt);
  }
  const trialTenants = new Set(tenants.filter((tenant) => tenant.trial_ends_at).map((tenant) => String(tenant.id)));
  const monthly = months.map((month) => ({
    month,
    label: `${MONTH_LABEL[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`,
    received: round(paid.filter((payment) => payment.paidAt.startsWith(month)).reduce((acc, payment) => acc + payment.value, 0)),
    trialsStarted: tenants.filter((tenant) => tenant.trial_ends_at && tenant.created_at && monthOf(String(tenant.created_at)) === month).length,
    trialsConverted: [...firstPaid.entries()].filter(([tenantId, date]) => trialTenants.has(tenantId) && date.startsWith(month)).length,
  }));

  return {
    generatedAt: now.toISOString(),
    mrr: { automatic: round(automatic), manual: round(manual), total, arr: round(total * 12), paying, avgTicket: paying ? round(total / paying) : null },
    trials: { active: trialRows.length, endingSoon: trialRows.filter((row) => row.daysLeft <= 2).length, list: trialList },
    conversion: { windowDays: CONVERSION_WINDOW_DAYS, ended: ended.length, converted, rate: ended.length ? Math.round((converted / ended.length) * 1000) / 10 : null },
    overdue: { pastDue: sum('past_due'), suspended: sum('suspended'), list: overdueList },
    canceled: { count: canceledList.length, list: canceledList },
    months: monthly,
    receivedThisMonth: monthly[monthly.length - 1].received,
    recentPayments: [...paid]
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
      .slice(0, 10)
      .map((payment) => ({ ...payment, tenantName: (payment.tenantId && names.get(payment.tenantId)) || 'Empresa removida' })),
    byPlan: [...byPlan.values()].sort((a, b) => b.mrr - a.mrr),
  };
}
