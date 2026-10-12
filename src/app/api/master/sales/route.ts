import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { salesDashboard } from '@/services/sales-dashboard.service';

/** Painel Master > Vendas: MRR, testes grátis, conversão, inadimplência e recebimentos. */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    return NextResponse.json({ data: await salesDashboard() });
  } catch (error) {
    console.error('[vendas] painel falhou:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Não foi possível calcular os números agora.' }, { status: 500 });
  }
}
