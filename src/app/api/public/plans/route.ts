import { NextResponse } from 'next/server';
import { fetchSalesContact, listPublicPlans } from '@/services/plans.service';

// Público (tela de login): planos à venda e o contato comercial da Vórtice.
export async function GET() {
  try {
    const [plans, contact] = await Promise.all([listPublicPlans(), fetchSalesContact()]);
    return NextResponse.json(
      { data: { plans, contact } },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    );
  } catch {
    return NextResponse.json({ data: { plans: [], contact: { whatsapp: null, email: null, website: null } } });
  }
}
