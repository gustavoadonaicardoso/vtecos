import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { callHistory } from '@/services/dialer.service';

/** Últimas 50 ligações de quem está logado (discador flutuante). */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    return NextResponse.json({ data: await callHistory(auth.tenantId, auth.profile.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar o histórico.' }, { status: 500 });
  }
}
