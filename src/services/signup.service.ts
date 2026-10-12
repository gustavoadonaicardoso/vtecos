/**
 * ============================================================
 * VTEC OS — Cadastro com teste grátis (tela de login > Planos)
 * ============================================================
 * Quem quer conhecer o sistema escolhe um plano e cria a própria conta:
 *   1. empresa nova com o plano escolhido;
 *   2. assinatura no Asaas em teste grátis -- a primeira fatura vence
 *      no fim do teste (TRIAL_DAYS); paga antes, vira assinatura;
 *      não paga, segue a regra normal (3 dias de atraso → suspensa);
 *   3. administrador com o e-mail e a senha informados;
 *   4. lead no CRM da Vórtice, que recebe os lembretes pelo WhatsApp.
 * Se um passo falha, os anteriores são desfeitos. Um CPF/CNPJ e um
 * e-mail só fazem um teste.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { createTenant } from '@/services/tenants.service';
import { createUserWithProfile } from '@/services/users.service';
import { registerTrialLead } from '@/services/trial-messages.service';
import {
  TRIAL_DAYS,
  addDays,
  cyclePrice,
  disableBilling,
  enableBilling,
  notifyPlatform,
  onlyDigits,
  todaySP,
  validCpfCnpj,
} from '@/services/billing.service';

export interface SignupInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  company: string;
  cpfCnpj: string;
  planId: string;
  cycle: 'MONTHLY' | 'YEARLY';
}

export function parseSignup(body: Record<string, unknown>): { ok: true; value: SignupInput } | { ok: false; error: string } {
  const text = (key: string, max: number) => String(body[key] ?? '').trim().slice(0, max);
  const name = text('name', 120);
  const company = text('company', 120);
  const email = text('email', 160).toLowerCase();
  const phone = onlyDigits(body.phone).slice(0, 13);
  const password = String(body.password ?? '');
  const cpfCnpj = onlyDigits(body.cpfCnpj);
  const planId = text('planId', 64);
  if (name.split(/\s+/).length < 2) return { ok: false, error: 'Informe seu nome e sobrenome.' };
  if (company.length < 2) return { ok: false, error: 'Informe o nome da empresa.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'Informe um e-mail válido: ele será o seu login.' };
  if (phone.length < 10) return { ok: false, error: 'Informe o WhatsApp com DDD.' };
  if (password.length < 8) return { ok: false, error: 'A senha precisa ter pelo menos 8 caracteres.' };
  if (password.length > 72) return { ok: false, error: 'A senha pode ter no máximo 72 caracteres.' };
  if (!validCpfCnpj(cpfCnpj)) return { ok: false, error: 'Informe um CPF ou CNPJ válido (é usado na fatura).' };
  if (!planId) return { ok: false, error: 'Escolha um plano.' };
  if (body.accepted !== true) return { ok: false, error: 'Para criar a conta, aceite a política de privacidade.' };
  return { ok: true, value: { name, company, email, phone, password, cpfCnpj, planId, cycle: body.cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY' } };
}

type Result = { ok: true; tenantId: string; trialEndsAt: string } | { ok: false; status: number; error: string };

/**
 * Confere o que dá para conferir antes de mandar o código por e-mail:
 * plano à venda, e-mail e CPF/CNPJ ainda sem conta.
 */
export async function precheckSignup(input: SignupInput): Promise<{ ok: true; plan: { id: string; name: string; price: number } } | { ok: false; status: number; error: string }> {
  const { data: plan } = await db.from('plans').select('id, name, price, active, show_on_login').eq('id', input.planId).maybeSingle();
  if (!plan || !plan.active || !plan.show_on_login || Number(plan.price) < 5) {
    return { ok: false, status: 400, error: 'Este plano não está disponível para teste grátis. Escolha outro ou fale com a Vórtice.' };
  }

  // tenant-scope: ok (cadastro público: o e-mail de login é único no sistema todo)
  const { data: sameEmail } = await db.from('profiles').select('id').ilike('email', input.email).limit(1);
  if (sameEmail && sameEmail.length) {
    return { ok: false, status: 409, error: 'Já existe uma conta com este e-mail. Entre pela tela de login (ou use "Esqueceu a senha?").' };
  }
  const { data: sameDocument } = await db.from('tenants').select('id').eq('document', input.cpfCnpj).limit(1);
  if (sameDocument && sameDocument.length) {
    return { ok: false, status: 409, error: 'Este CPF/CNPJ já tem uma conta ou já usou o teste grátis. Entre pela tela de login ou fale com a Vórtice.' };
  }

  return { ok: true, plan: { id: String(plan.id), name: String(plan.name), price: Number(plan.price) } };
}

export async function startTrial(input: SignupInput, deps: { createUser: typeof createUserWithProfile } = { createUser: createUserWithProfile }): Promise<Result> {
  const checked = await precheckSignup(input);
  if (!checked.ok) return checked;
  const plan = checked.plan;

  const created = await createTenant({
    name: input.company,
    plan_id: plan.id,
    document: input.cpfCnpj,
    contact_email: input.email,
    notes: `Cadastro pelo teste grátis em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`,
  });
  if (!created.success || !created.data) return { ok: false, status: 500, error: 'Não foi possível criar a empresa agora. Tente de novo em instantes.' };
  const tenantId = String(created.data.id);
  const undoTenant = () => db.from('tenants').delete().eq('id', tenantId);
  await db.from('tenants').update({ phone: input.phone }).eq('id', tenantId);

  const trialEndDate = addDays(todaySP(), TRIAL_DAYS);
  const trialEndsAt = `${trialEndDate}T23:59:59-03:00`;
  const billing = await enableBilling(tenantId, {
    cpfCnpj: input.cpfCnpj,
    email: input.email,
    phone: input.phone,
    cycle: input.cycle,
    firstDueDate: trialEndDate,
    trialEndsAt,
  });
  if (!billing.success) {
    await undoTenant();
    console.error('[cadastro] cobrança não criada:', billing.error);
    return { ok: false, status: 502, error: 'Não foi possível preparar a cobrança agora. Confira o CPF/CNPJ e tente de novo em instantes.' };
  }

  const user = await deps.createUser({ tenantId, name: input.name, email: input.email, password: input.password, role: 'ADMIN', permissions: {} });
  if (!user.success) {
    await disableBilling(tenantId).catch(() => null);
    await undoTenant();
    return { ok: false, status: user.status === 409 ? 409 : 400, error: user.status === 409 ? 'Já existe uma conta com este e-mail. Entre pela tela de login.' : user.error || 'Não foi possível criar o seu acesso.' };
  }

  // Lead no CRM da Vórtice + lembretes pelo WhatsApp (boas-vindas sai na próxima conferência, em até 5 min).
  await registerTrialLead(tenantId, {
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    cpfCnpj: input.cpfCnpj,
    planName: String(plan.name),
    value: cyclePrice(Number(plan.price) || 0, input.cycle),
    cycle: input.cycle,
    trialEndDate: trialEndDate,
  });

  await notifyPlatform(
    'Novo teste grátis',
    `${input.company} começou o teste do plano ${plan.name} (${input.cycle === 'YEARLY' ? 'anual' : 'mensal'}) até ${trialEndDate.split('-').reverse().join('/')}. Contato: ${input.name}, ${input.email}, WhatsApp ${input.phone}. Já está no CRM com a etiqueta "Teste grátis".`,
  ).catch(() => {});
  return { ok: true, tenantId, trialEndsAt };
}
