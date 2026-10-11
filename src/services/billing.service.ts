/**
 * ============================================================
 * VTEC OS — Cobrança automática das empresas clientes (Asaas)
 * ============================================================
 * Cada empresa com cobrança automática tem uma assinatura no Asaas
 * (billingType UNDEFINED: o cliente escolhe Pix, boleto ou cartão na
 * fatura). A situação dela aqui (tenants.billing_status) é sempre
 * recalculada a partir das cobranças da assinatura no Asaas
 * (`reconcileTenant`): no aviso do Asaas (webhook) e na rotina do
 * servidor, que pega o que um aviso perdido deixou para trás.
 *
 *   em dia ──vence e não paga──▶ em atraso ──3 dias──▶ suspensa
 *      ▲                              │                    │
 *      └──────────── pagou ───────────┴────────────────────┘
 *
 * Suspensa há mais de 30 dias: a assinatura é cancelada no Asaas (para
 * de gerar faturas). Empresas em "manual" nunca são tocadas.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { forgetTenantPlans } from '@/lib/plan-limits';
import { asaas, AsaasError, OPEN_STATUSES, PAID_STATUSES, type AsaasCycle, type AsaasPayment } from '@/lib/asaas';
import type { ServiceResult } from '@/types';

export const TRIAL_DAYS = 7;
/** Dias de tolerância depois do vencimento; no dia seguinte, suspende. */
export const GRACE_DAYS = 3;
export const CANCEL_AFTER_SUSPENDED_DAYS = 30;
/** Avisa que o teste está acabando quando faltar isto. */
export const TRIAL_WARNING_DAYS = 2;

export type BillingStatus = 'manual' | 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled';
export const AUTOMATIC: BillingStatus[] = ['trial', 'active', 'past_due', 'suspended'];

type Row = Record<string, unknown>;

// ── Datas (horário de Brasília) ──────────────────────────────

const TZ = 'America/Sao_Paulo';
export const todaySP = (at = new Date()) => at.toLocaleDateString('sv-SE', { timeZone: TZ });
export function addDays(date: string, days: number) {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
export const brDate = (date: string | null | undefined) => (date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : '');

// ── Preço ────────────────────────────────────────────────────

/** Anual = 10 mensalidades (2 meses grátis). */
export const cyclePrice = (monthly: number, cycle: AsaasCycle) => Math.round((cycle === 'YEARLY' ? monthly * 10 : monthly) * 100) / 100;
export const cycleLabel = (cycle: string) => (cycle === 'YEARLY' ? 'anual' : 'mensal');
export const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export function validCpfCnpj(value: string) {
  const digits = onlyDigits(value);
  if ((digits.length !== 11 && digits.length !== 14) || /^(\d)\1+$/.test(digits)) return false;
  const at = (index: number) => Number(digits[index]);
  if (digits.length === 11) {
    const cpfDigit = (length: number) => {
      let sum = 0;
      for (let i = 0; i < length; i++) sum += at(i) * (length + 1 - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    };
    return cpfDigit(9) === at(9) && cpfDigit(10) === at(10);
  }
  const cnpjDigit = (weights: number[]) => {
    const rest = weights.reduce((sum, weight, i) => sum + at(i) * weight, 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return cnpjDigit([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === at(12) && cnpjDigit([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === at(13);
}

// ── Leitura ──────────────────────────────────────────────────

const TENANT_COLUMNS = 'id, name, status, plan_id, is_platform, document, contact_email, phone, billing_status, billing_cycle, trial_ends_at, asaas_customer_id, asaas_subscription_id, billing_payment_id, billing_next_due, billing_invoice_url, billing_overdue_since, billing_last_paid_at, billing_suspended_at, billing_checked_at, billing_notified';

async function loadTenant(tenantId: string): Promise<Row | null> {
  const { data } = await db.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle();
  return (data as Row) || null;
}

async function loadPlan(planId: unknown) {
  if (typeof planId !== 'string' || !planId) return null;
  const { data } = await db.from('plans').select('id, name, price, active').eq('id', planId).maybeSingle();
  return data as { id: string; name: string; price: number; active: boolean } | null;
}

export interface BillingSummary {
  status: BillingStatus;
  automatic: boolean;
  cycle: AsaasCycle;
  planName: string | null;
  value: number | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  nextDue: string | null;
  invoiceUrl: string | null;
  overdueSince: string | null;
  /** Dia em que o acesso é suspenso se a fatura em atraso não for paga. */
  suspendOn: string | null;
  suspendedAt: string | null;
  lastPaidAt: string | null;
  graceUntil: string | null;
}

export function summarize(tenant: Row, plan?: { name: string; price: number } | null, now = new Date()): BillingSummary {
  const status = (tenant.billing_status as BillingStatus) || 'manual';
  const cycle = (tenant.billing_cycle as AsaasCycle) === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const trialEndsAt = (tenant.trial_ends_at as string) || null;
  const overdueSince = (tenant.billing_overdue_since as string) || null;
  const notified = (tenant.billing_notified as Row) || {};
  const graceUntil = typeof notified.grace_until === 'string' ? notified.grace_until : null;
  let suspendOn = overdueSince ? addDays(overdueSince, GRACE_DAYS + 1) : null;
  if (suspendOn && graceUntil && graceUntil >= suspendOn) suspendOn = addDays(graceUntil, 1);
  return {
    status,
    automatic: Boolean(tenant.asaas_subscription_id) && AUTOMATIC.includes(status),
    cycle,
    planName: plan?.name ?? null,
    value: plan ? cyclePrice(Number(plan.price) || 0, cycle) : null,
    trialEndsAt,
    trialDaysLeft: status === 'trial' && trialEndsAt ? Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000)) : null,
    nextDue: (tenant.billing_next_due as string) || null,
    invoiceUrl: (tenant.billing_invoice_url as string) || null,
    overdueSince,
    suspendOn: status === 'past_due' ? suspendOn : null,
    suspendedAt: (tenant.billing_suspended_at as string) || null,
    lastPaidAt: (tenant.billing_last_paid_at as string) || null,
    graceUntil,
  };
}

export async function billingSummary(tenantId: string): Promise<BillingSummary | null> {
  const tenant = await loadTenant(tenantId);
  if (!tenant || tenant.is_platform) return null;
  return summarize(tenant, await loadPlan(tenant.plan_id));
}

/** Faturas da assinatura (mais recentes primeiro) para Configurações > Plano e o Master. */
export async function billingInvoices(tenantId: string): Promise<{ id: string; value: number; dueDate: string; status: string; paidAt: string | null; invoiceUrl: string | null }[]> {
  const tenant = await loadTenant(tenantId);
  if (!tenant?.asaas_subscription_id) return [];
  const { data } = await asaas.subscriptionPayments(String(tenant.asaas_subscription_id), { limit: 100 });
  return (data || [])
    .filter((payment) => !payment.deleted)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 24)
    .map((payment) => ({
      id: payment.id,
      value: Number(payment.value) || 0,
      dueDate: payment.dueDate,
      status: payment.status,
      paidAt: payment.paymentDate || null,
      invoiceUrl: payment.invoiceUrl || null,
    }));
}

// ── Avisos ───────────────────────────────────────────────────

async function notifyTenantAdmins(tenantId: string, title: string, content: string) {
  const { data } = await db.from('profiles').select('id').eq('tenant_id', tenantId).eq('role', 'ADMIN').eq('status', 'ACTIVE');
  const rows = (data || []).map((row) => ({ user_id: row.id, type: 'plan', title, content, is_read: false, link: '/settings?tab=plan' }));
  if (rows.length) await db.from('system_notifications').insert(rows);
}

async function notifyPlatform(title: string, content: string) {
  // tenant-scope: ok (avisos internos para a equipe da plataforma)
  const { data: platform } = await db.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  if (!platform?.id) return;
  const { data } = await db.from('profiles').select('id').eq('tenant_id', platform.id).eq('role', 'ADMIN').eq('status', 'ACTIVE');
  const rows = (data || []).map((row) => ({ user_id: row.id, type: 'system', title, content, is_read: false, link: '/master?tab=tenants' }));
  if (rows.length) await db.from('system_notifications').insert(rows);
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── Ligar, mudar e desligar a cobrança ───────────────────────

export interface EnableBillingInput {
  cpfCnpj: string;
  email: string;
  phone?: string | null;
  cycle: AsaasCycle;
  /** Vencimento da primeira fatura (AAAA-MM-DD). */
  firstDueDate: string;
  /** Teste grátis até esta data (a primeira fatura vence nela). */
  trialEndsAt?: string | null;
}

export function parseEnableInput(body: Row): { ok: true; value: EnableBillingInput } | { ok: false; error: string } {
  const cpfCnpj = onlyDigits(body.cpfCnpj);
  if (!validCpfCnpj(cpfCnpj)) return { ok: false, error: 'Informe um CPF ou CNPJ válido (o Asaas exige para cobrar).' };
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Informe o e-mail que recebe as faturas.' };
  const cycle = body.cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const firstDueDate = String(body.firstDueDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) || firstDueDate < todaySP()) return { ok: false, error: 'Escolha o vencimento da primeira fatura (hoje ou depois).' };
  const phone = onlyDigits(body.phone) || null;
  return { ok: true, value: { cpfCnpj, email, phone, cycle, firstDueDate } };
}

export async function enableBilling(tenantId: string, input: EnableBillingInput): Promise<ServiceResult<BillingSummary>> {
  const tenant = await loadTenant(tenantId);
  if (!tenant) return { success: false, error: 'Empresa não encontrada.' };
  if (tenant.is_platform) return { success: false, error: 'A empresa da plataforma não é cobrada.' };
  if (tenant.asaas_subscription_id && AUTOMATIC.includes(tenant.billing_status as BillingStatus)) {
    return { success: false, error: 'Esta empresa já tem cobrança automática.' };
  }
  const plan = await loadPlan(tenant.plan_id);
  if (!plan || !plan.active) return { success: false, error: 'Escolha um plano ativo para a empresa antes de ligar a cobrança.' };
  const value = cyclePrice(Number(plan.price) || 0, input.cycle);
  if (value < 5) return { success: false, error: 'O plano precisa ter preço (o Asaas não cobra menos de R$ 5,00).' };

  try {
    let customerId = (tenant.asaas_customer_id as string) || '';
    const mobilePhone = input.phone && input.phone.length >= 10 ? input.phone.replace(/^55(?=\d{10,11}$)/, '') : null;
    if (customerId) {
      await asaas.updateCustomer(customerId, { name: String(tenant.name), cpfCnpj: input.cpfCnpj, email: input.email, mobilePhone });
    } else {
      const customer = await asaas.createCustomer({ name: String(tenant.name), cpfCnpj: input.cpfCnpj, email: input.email, mobilePhone, externalReference: tenantId });
      customerId = customer.id;
      // Guarda já: se a assinatura falhar, a próxima tentativa reaproveita o cliente.
      await db.from('tenants').update({ asaas_customer_id: customerId }).eq('id', tenantId);
    }

    const subscription = await asaas.createSubscription({
      customer: customerId,
      value,
      nextDueDate: input.firstDueDate,
      cycle: input.cycle,
      description: `vtec os - plano ${plan.name} (${cycleLabel(input.cycle)})`,
      externalReference: tenantId,
    });

    const { error } = await db.from('tenants').update({
      asaas_customer_id: customerId,
      asaas_subscription_id: subscription.id,
      billing_cycle: input.cycle,
      billing_status: input.trialEndsAt ? 'trial' : 'active',
      trial_ends_at: input.trialEndsAt || null,
      billing_next_due: input.firstDueDate,
      billing_payment_id: null,
      billing_invoice_url: null,
      billing_overdue_since: null,
      billing_suspended_at: null,
      billing_checked_at: null,
      billing_notified: {},
      document: (tenant.document as string) || input.cpfCnpj,
      contact_email: (tenant.contact_email as string) || input.email,
    }).eq('id', tenantId);
    if (error) return { success: false, error: error.message };
  } catch (error) {
    return { success: false, error: error instanceof AsaasError ? error.message : 'Não foi possível criar a cobrança no Asaas.' };
  }

  // A fatura costuma ser criada junto: pega o link dela já.
  await reconcileTenant(tenantId).catch(() => null);
  const summary = await billingSummary(tenantId);
  return { success: true, data: summary! };
}

/** Plano ou ciclo mudou: a assinatura (e a fatura em aberto) passam a cobrar o valor novo. */
export async function syncSubscriptionPrice(tenantId: string, cycle?: AsaasCycle): Promise<ServiceResult> {
  const tenant = await loadTenant(tenantId);
  if (!tenant?.asaas_subscription_id || !AUTOMATIC.includes(tenant.billing_status as BillingStatus)) {
    if (cycle && tenant) await db.from('tenants').update({ billing_cycle: cycle }).eq('id', tenantId);
    return { success: true };
  }
  const plan = await loadPlan(tenant.plan_id);
  if (!plan) return { success: false, error: 'A empresa está sem plano: a cobrança não foi alterada.' };
  const nextCycle = cycle || ((tenant.billing_cycle as AsaasCycle) === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
  try {
    await asaas.updateSubscription(String(tenant.asaas_subscription_id), {
      value: cyclePrice(Number(plan.price) || 0, nextCycle),
      cycle: nextCycle,
      description: `vtec os - plano ${plan.name} (${cycleLabel(nextCycle)})`,
    });
  } catch (error) {
    return { success: false, error: error instanceof AsaasError ? error.message : 'Não foi possível atualizar a cobrança no Asaas.' };
  }
  await db.from('tenants').update({ billing_cycle: nextCycle }).eq('id', tenantId);
  await reconcileTenant(tenantId).catch(() => null);
  return { success: true };
}

/** Desliga a cobrança automática (cancela a assinatura no Asaas) e volta para "manual". */
export async function disableBilling(tenantId: string): Promise<ServiceResult> {
  const tenant = await loadTenant(tenantId);
  if (!tenant) return { success: false, error: 'Empresa não encontrada.' };
  if (tenant.asaas_subscription_id && tenant.billing_status !== 'canceled') {
    try {
      await asaas.deleteSubscription(String(tenant.asaas_subscription_id));
    } catch (error) {
      if (!(error instanceof AsaasError && error.status === 404)) {
        return { success: false, error: error instanceof AsaasError ? error.message : 'Não foi possível cancelar a assinatura no Asaas.' };
      }
    }
  }
  const { error } = await db.from('tenants').update({
    billing_status: 'manual',
    asaas_subscription_id: null,
    billing_payment_id: null,
    billing_next_due: null,
    billing_invoice_url: null,
    billing_overdue_since: null,
    billing_suspended_at: null,
    trial_ends_at: null,
    billing_notified: {},
  }).eq('id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Libera o acesso de uma empresa atrasada até a data (cortesia do Master). */
export async function grantGrace(tenantId: string, until: string): Promise<ServiceResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < todaySP()) return { success: false, error: 'Escolha uma data a partir de hoje.' };
  const tenant = await loadTenant(tenantId);
  if (!tenant) return { success: false, error: 'Empresa não encontrada.' };
  const notified = { ...((tenant.billing_notified as Row) || {}), grace_until: until };
  const updates: Row = { billing_notified: notified };
  if (tenant.billing_status === 'suspended') {
    updates.billing_status = 'past_due';
    updates.status = 'ACTIVE';
    updates.billing_suspended_at = null;
  }
  const { error } = await db.from('tenants').update(updates).eq('id', tenantId);
  if (error) return { success: false, error: error.message };
  forgetTenantPlans(tenantId);
  return { success: true };
}

/** Teste grátis: mais dias (a primeira fatura passa a vencer no fim do teste novo). */
export async function extendTrial(tenantId: string, days: number): Promise<ServiceResult> {
  const tenant = await loadTenant(tenantId);
  if (!tenant || tenant.billing_status !== 'trial' || !tenant.trial_ends_at) return { success: false, error: 'Esta empresa não está no teste grátis.' };
  const base = Math.max(Date.parse(String(tenant.trial_ends_at)), Date.now());
  const trialEndsAt = new Date(base + days * 86_400_000).toISOString();
  const dueDate = todaySP(new Date(trialEndsAt));
  try {
    if (tenant.asaas_subscription_id) await asaas.updateSubscription(String(tenant.asaas_subscription_id), { nextDueDate: dueDate });
  } catch (error) {
    return { success: false, error: error instanceof AsaasError ? error.message : 'Não foi possível mudar o vencimento no Asaas.' };
  }
  // A primeira fatura já existe: tenta levar o vencimento dela junto. Se o
  // Asaas não deixar, o teste continua protegido (o atraso só conta depois
  // do fim do teste -- ver reconcileTenant).
  if (tenant.billing_payment_id) await asaas.updatePaymentDueDate(String(tenant.billing_payment_id), dueDate).catch(() => null);
  const notified = { ...((tenant.billing_notified as Row) || {}) };
  delete notified.trial_warning;
  await db.from('tenants').update({ trial_ends_at: trialEndsAt, billing_next_due: dueDate, billing_notified: notified }).eq('id', tenantId);
  await reconcileTenant(tenantId).catch(() => null);
  return { success: true };
}

// ── Situação a partir do Asaas ───────────────────────────────

export interface ReconcileResult {
  status: BillingStatus;
  changed: string[];
}

/**
 * Recalcula a situação da empresa pelas cobranças da assinatura no
 * Asaas e aplica: link da fatura em aberto, atraso, suspensão e
 * reativação. Seguro para chamar quantas vezes for preciso.
 */
export async function reconcileTenant(tenantId: string, now = new Date()): Promise<ReconcileResult | null> {
  const tenant = await loadTenant(tenantId);
  if (!tenant || tenant.is_platform || !tenant.asaas_subscription_id) return null;
  const status = tenant.billing_status as BillingStatus;
  if (!AUTOMATIC.includes(status)) return null;

  const today = todaySP(now);
  const { data } = await asaas.subscriptionPayments(String(tenant.asaas_subscription_id), { limit: 100 });
  const payments = (data || []).filter((payment) => !payment.deleted);
  const byDue = (a: AsaasPayment, b: AsaasPayment) => a.dueDate.localeCompare(b.dueDate);
  const open = payments.filter((payment) => OPEN_STATUSES.includes(payment.status)).sort(byDue);
  // Durante o teste grátis nada está atrasado; depois dele, o atraso conta
  // a partir do fim do teste (mesmo que a fatura tenha vencido antes).
  const trialEnd = tenant.trial_ends_at ? todaySP(new Date(String(tenant.trial_ends_at))) : null;
  const inTrial = status === 'trial' && Boolean(trialEnd) && today <= String(trialEnd);
  // O Asaas marca "vencida" no dia seguinte ao vencimento; aqui também.
  const overdue = inTrial ? [] : open.filter((payment) => payment.status === 'OVERDUE' || payment.dueDate < today);
  const paid = payments
    .filter((payment) => PAID_STATUSES.includes(payment.status))
    .sort((a, b) => String(b.paymentDate || b.dueDate).localeCompare(String(a.paymentDate || a.dueDate)));

  const notified: Row = { ...((tenant.billing_notified as Row) || {}) };
  const graceUntil = typeof notified.grace_until === 'string' ? notified.grace_until : null;
  if (graceUntil && graceUntil < today) delete notified.grace_until;

  const firstDue = open[0]?.dueDate ?? null;
  const updates: Row = {
    billing_payment_id: open[0]?.id ?? null,
    billing_invoice_url: open[0]?.invoiceUrl ?? null,
    // Fatura antiga de um teste estendido: na prática vence no fim do teste.
    billing_next_due: firstDue && trialEnd && firstDue < trialEnd ? trialEnd : firstDue,
    billing_checked_at: now.toISOString(),
  };
  if (paid[0]) updates.billing_last_paid_at = new Date(`${paid[0].paymentDate || paid[0].dueDate}T12:00:00Z`).toISOString();

  const changed: string[] = [];
  let next: BillingStatus = status;
  const planName = (await loadPlan(tenant.plan_id))?.name || 'do sistema';

  if (overdue.length) {
    const since = trialEnd && overdue[0].dueDate < trialEnd ? trialEnd : overdue[0].dueDate;
    updates.billing_overdue_since = since;
    const suspendOn = addDays(since, GRACE_DAYS + 1);
    const graceActive = Boolean(notified.grace_until) && String(notified.grace_until) >= today;
    if (status === 'suspended') {
      next = 'suspended';
    } else if (today >= suspendOn && !graceActive) {
      next = 'suspended';
      updates.status = 'SUSPENDED';
      updates.billing_suspended_at = now.toISOString();
      changed.push('suspended');
      await notifyPlatform('Empresa suspensa por falta de pagamento', `${tenant.name}: fatura de ${brDate(since)} sem pagamento há mais de ${GRACE_DAYS} dias.`).catch(() => {});
    } else {
      next = 'past_due';
      const key = `overdue:${overdue[0].id}`;
      if (!notified[key]) {
        notified[key] = today;
        changed.push('overdue');
        await notifyTenantAdmins(
          tenantId,
          'Pagamento em atraso',
          `A fatura do plano ${planName} venceu em ${brDate(since)}. Pague até ${brDate(addDays(suspendOn, -1))} para o acesso não ser suspenso. O link da fatura está em Configurações > Plano.`,
        ).catch(() => {});
      }
    }

    // Suspensa há muito tempo: para de gerar faturas no Asaas.
    const suspendedAt = (updates.billing_suspended_at as string) || (tenant.billing_suspended_at as string) || null;
    if (next === 'suspended' && suspendedAt && daysBetween(todaySP(new Date(suspendedAt)), today) >= CANCEL_AFTER_SUSPENDED_DAYS) {
      try {
        await asaas.deleteSubscription(String(tenant.asaas_subscription_id));
      } catch (error) {
        if (!(error instanceof AsaasError && error.status === 404)) throw error;
      }
      next = 'canceled';
      updates.billing_invoice_url = null;
      updates.billing_payment_id = null;
      updates.billing_next_due = null;
      changed.push('canceled');
      await notifyPlatform('Assinatura cancelada', `${tenant.name}: suspensa há ${CANCEL_AFTER_SUSPENDED_DAYS} dias sem pagamento. A assinatura foi cancelada no Asaas.`).catch(() => {});
    }
  } else {
    updates.billing_overdue_since = null;
    if (status === 'past_due' || status === 'suspended') {
      next = 'active';
      changed.push('reactivated');
      if (status === 'suspended' || tenant.billing_suspended_at) {
        updates.status = 'ACTIVE';
        updates.billing_suspended_at = null;
        await notifyPlatform('Empresa reativada', `${tenant.name} pagou a fatura em atraso e voltou a ter acesso.`).catch(() => {});
      }
      await notifyTenantAdmins(tenantId, 'Pagamento recebido', `Obrigado! O pagamento do plano ${planName} foi confirmado.`).catch(() => {});
      for (const key of Object.keys(notified)) if (key.startsWith('overdue:')) delete notified[key];
    } else if (status === 'trial') {
      if (paid.length) {
        next = 'active';
        changed.push('converted');
        await notifyTenantAdmins(tenantId, 'Assinatura confirmada', `Pagamento recebido: o plano ${planName} continua liberado. Obrigado!`).catch(() => {});
        await notifyPlatform('Teste virou assinatura', `${tenant.name} pagou a primeira fatura do plano ${planName}.`).catch(() => {});
      } else if (tenant.trial_ends_at && !notified.trial_warning) {
        const endsOn = todaySP(new Date(String(tenant.trial_ends_at)));
        if (daysBetween(today, endsOn) <= TRIAL_WARNING_DAYS) {
          notified.trial_warning = today;
          changed.push('trial_warning');
          await notifyTenantAdmins(
            tenantId,
            'Seu teste grátis está acabando',
            `O teste do plano ${planName} vai até ${brDate(endsOn)}. Para continuar sem interrupção, pague a fatura: o link está em Configurações > Plano.`,
          ).catch(() => {});
        }
      }
    }
  }

  updates.billing_status = next;
  updates.billing_notified = notified;
  const { error } = await db.from('tenants').update(updates).eq('id', tenantId);
  if (error) throw new Error(error.message);
  if ('status' in updates) forgetTenantPlans(tenantId);
  return { status: next, changed };
}

// ── Avisos do Asaas (webhook) ────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tenantForPayment(payment: Row | null): Promise<string | null> {
  if (!payment) return null;
  if (typeof payment.subscription === 'string' && payment.subscription) {
    const { data } = await db.from('tenants').select('id').eq('asaas_subscription_id', payment.subscription).maybeSingle();
    if (data?.id) return String(data.id);
  }
  if (typeof payment.externalReference === 'string' && UUID.test(payment.externalReference)) {
    const { data } = await db.from('tenants').select('id').eq('id', payment.externalReference).maybeSingle();
    if (data?.id) return String(data.id);
  }
  if (typeof payment.customer === 'string' && payment.customer) {
    const { data } = await db.from('tenants').select('id').eq('asaas_customer_id', payment.customer).maybeSingle();
    if (data?.id) return String(data.id);
  }
  return null;
}

/**
 * Um aviso do Asaas. Grava uma vez só (o Asaas pode repetir) e
 * recalcula a empresa. Nunca lança: o Asaas precisa de resposta 200,
 * senão para a fila de avisos depois de 15 falhas.
 */
export async function handleAsaasEvent(body: Row): Promise<{ status: 'processed' | 'duplicate' | 'ignored' | 'error'; tenantId?: string | null }> {
  const event = String(body.event || '').slice(0, 80);
  const payment = body.payment && typeof body.payment === 'object' ? (body.payment as Row) : null;
  const paymentId = payment && typeof payment.id === 'string' ? payment.id : null;
  const eventId = String(body.id || `${event}:${paymentId}:${payment?.status ?? ''}:${payment?.dateCreated ?? ''}`).slice(0, 200);
  if (!event) return { status: 'ignored' };

  const tenantId = await tenantForPayment(payment);
  const { error: insertError } = await db.from('billing_events').insert({ id: eventId, tenant_id: tenantId, event, payment_id: paymentId, payload: body });
  if (insertError) {
    if (/duplicate key|unique/i.test(insertError.message)) return { status: 'duplicate', tenantId };
    console.error('[cobranca] falha ao gravar aviso do Asaas:', insertError.message);
  }
  if (!tenantId) return { status: 'ignored' };

  try {
    await reconcileTenant(tenantId);
    if (/REFUND|CHARGEBACK/.test(event)) {
      const { data } = await db.from('tenants').select('name').eq('id', tenantId).maybeSingle();
      await notifyPlatform('Estorno ou contestação no Asaas', `${data?.name || 'Uma empresa'}: ${event} na cobrança ${paymentId}${payment?.value ? ` de ${money(Number(payment.value))}` : ''}.`);
    }
    return { status: 'processed', tenantId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('billing_events').update({ error: message.slice(0, 500) }).eq('id', eventId);
    console.error('[cobranca] aviso do Asaas não processado (a rotina tenta de novo):', message);
    return { status: 'error', tenantId };
  }
}

// ── Rotina do servidor ───────────────────────────────────────

/** Quem precisa ser conferido no Asaas agora (atrasadas e testes com mais frequência). */
export function dueForCheck(tenant: Row, now = new Date()): boolean {
  const status = tenant.billing_status as BillingStatus;
  if (!tenant.asaas_subscription_id || !AUTOMATIC.includes(status)) return false;
  const last = tenant.billing_checked_at ? Date.parse(String(tenant.billing_checked_at)) : 0;
  const age = now.getTime() - last;
  if (status === 'past_due' || status === 'suspended' || status === 'trial') return age >= 30 * 60_000;
  const nextDue = tenant.billing_next_due as string | null;
  if (!nextDue || nextDue <= todaySP(now)) return age >= 2 * 3600_000;
  return age >= 24 * 3600_000;
}

export async function runBillingCycle(now = new Date(), limit = 20): Promise<{ checked: number; failed: number }> {
  const { data } = await db
    .from('tenants')
    .select('id, billing_status, asaas_subscription_id, billing_next_due, billing_checked_at')
    .in('billing_status', AUTOMATIC)
    .not('asaas_subscription_id', 'is', null);
  const due = ((data || []) as Row[]).filter((row) => dueForCheck(row, now)).slice(0, limit);
  let failed = 0;
  for (const row of due) {
    try {
      await reconcileTenant(String(row.id), now);
    } catch (error) {
      failed++;
      console.error('[cobranca] falha ao conferir', row.id, error instanceof Error ? error.message : error);
      // Tenta de novo no próximo ciclo, sem martelar o Asaas.
      await db.from('tenants').update({ billing_checked_at: now.toISOString() }).eq('id', String(row.id));
    }
  }
  return { checked: due.length, failed };
}
