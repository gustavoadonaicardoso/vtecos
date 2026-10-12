import { NextResponse } from 'next/server';
import { fetchSalesContact, listPublicPlans } from '@/services/plans.service';
import { asaasReady } from '@/lib/asaas';
import { mailerReady } from '@/lib/mailer';
import { TRIAL_DAYS } from '@/services/billing.service';

// Público (tela de login): planos à venda, o contato comercial da Vórtice
// e se o teste grátis está disponível.
export async function GET() {
  try {
    const [plans, contact, ready, emailCode] = await Promise.all([listPublicPlans(), fetchSalesContact(), asaasReady().catch(() => false), mailerReady().catch(() => false)]);
    // Teste grátis: só com a cobrança (Asaas) configurada.
    return NextResponse.json(
      { data: { plans, contact, trial: { available: ready, days: TRIAL_DAYS, emailCode } } },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    );
  } catch {
    return NextResponse.json({ data: { plans: [], contact: { whatsapp: null, email: null, website: null }, trial: { available: false, days: TRIAL_DAYS } } });
  }
}
