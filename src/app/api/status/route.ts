import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { noticesFor } from '@/services/status.service';

/** Avisos de status para a faixa do topo (já filtrados pela empresa de quem está logado). */
export async function GET() {
  // permission: open (avisos do sistema valem para todo mundo)
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    return NextResponse.json({ data: await noticesFor({ tenantId: auth.tenantId }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar os avisos.' }, { status: 500 });
  }
}
