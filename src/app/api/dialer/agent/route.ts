import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { agentAction, agentState } from '@/services/dialer.service';


/** Situação do atendente no Discador (e a ligação que ele está atendendo). */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await agentState(auth.tenantId, auth.profile.id) });
}

/** action: heartbeat | available | pause | offline | wrapup (outcome, notes, next). */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  // sendBeacon (fechar a aba) manda texto puro: lê como texto e converte.
  const body = await request.text().then((text) => JSON.parse(text || '{}')).catch(() => ({}));
  const result = await agentAction(auth.tenantId, auth.profile.id, body);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}
