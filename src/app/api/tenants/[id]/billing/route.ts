import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requirePlatformAdmin } from '@/lib/session';
import { asaasReady } from '@/lib/asaas';
import {
  billingInvoices,
  billingSummary,
  disableBilling,
  enableBilling,
  extendTrial,
  grantGrace,
  parseEnableInput,
  reconcileTenant,
  syncSubscriptionPrice,
} from '@/services/billing.service';

/**
 * Painel Master > Empresas: cobrança automática de uma empresa (Asaas).
 * Só administradores da empresa da plataforma.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const summary = await billingSummary(id);
  if (!summary) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
  let invoices: Awaited<ReturnType<typeof billingInvoices>> = [];
  let invoicesError: string | null = null;
  if (summary.automatic || summary.status === 'canceled') {
    invoices = await billingInvoices(id).catch((error) => {
      invoicesError = error instanceof Error ? error.message : 'Não foi possível ler as faturas.';
      return [];
    });
  }
  return NextResponse.json({ data: { summary, invoices, invoicesError, ready: await asaasReady() } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || '');
  const actor = { id: auth.profile.id, name: auth.profile.name };
  const audit = (text: string) => logAudit(actor, 'SETTINGS_UPDATE', text, 'tenant', id, supabaseAdmin, auth.tenantId).catch(() => {});

  let result: { success: boolean; error?: string };
  if (action === 'enable') {
    if (!(await asaasReady())) return NextResponse.json({ error: 'Configure o Asaas em Painel Master > Plataforma antes.' }, { status: 400 });
    const parsed = parseEnableInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    result = await enableBilling(id, parsed.value);
    if (result.success) await audit(`Ligou a cobrança automática (${parsed.value.cycle === 'YEARLY' ? 'anual' : 'mensal'}, 1ª fatura em ${parsed.value.firstDueDate}).`);
  } else if (action === 'disable') {
    result = await disableBilling(id);
    if (result.success) await audit('Desligou a cobrança automática (assinatura cancelada no Asaas).');
  } else if (action === 'grace') {
    result = await grantGrace(id, String(body.until || ''));
    if (result.success) await audit(`Liberou o acesso apesar do atraso até ${body.until}.`);
  } else if (action === 'extend_trial') {
    const days = Math.min(30, Math.max(1, Math.floor(Number(body.days) || 7)));
    result = await extendTrial(id, days);
    if (result.success) await audit(`Estendeu o teste grátis em ${days} dia(s).`);
  } else if (action === 'cycle') {
    const cycle = body.cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
    result = await syncSubscriptionPrice(id, cycle);
    if (result.success) await audit(`Mudou a cobrança para ${cycle === 'YEARLY' ? 'anual' : 'mensal'}.`);
  } else if (action === 'refresh') {
    try {
      await reconcileTenant(id);
      result = { success: true };
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : 'Não foi possível conferir no Asaas.' };
    }
  } else {
    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  }

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: { summary: await billingSummary(id) } });
}
