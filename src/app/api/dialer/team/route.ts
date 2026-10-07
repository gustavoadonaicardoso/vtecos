import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { teamAgents } from '@/services/dialer.service';

/** Atendentes com o Discador aberto agora (e com quem estão falando). */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await teamAgents(auth.tenantId) });
}
