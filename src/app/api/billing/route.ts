import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { billingInvoices, billingSummary } from '@/services/billing.service';

/**
 * Cobrança da empresa de quem está logado (Configurações > Plano e a
 * faixa de aviso do topo). Só administradores; a empresa da plataforma
 * não é cobrada.
 */
export async function GET(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (auth.isPlatform) return NextResponse.json({ data: null });
  const summary = await billingSummary(auth.tenantId);
  if (!summary) return NextResponse.json({ data: null });
  const withInvoices = new URL(request.url).searchParams.get('invoices') === '1';
  const invoices = withInvoices && (summary.automatic || summary.status === 'canceled')
    ? await billingInvoices(auth.tenantId).catch(() => null)
    : null;
  return NextResponse.json({ data: { summary, invoices } });
}
