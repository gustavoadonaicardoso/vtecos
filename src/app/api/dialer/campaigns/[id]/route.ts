import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { campaignAction, deleteCampaign, getCampaign, isDialerManager } from '@/services/dialer.service';

const FORBIDDEN = 'Só administradores e gerentes gerenciam as campanhas do Discador.';
type Context = { params: Promise<{ id: string }> };

async function manager() {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return { response: NextResponse.json({ error: auth.error.message }, { status: auth.error.status }) };
  if (!isDialerManager(auth.profile.role)) return { response: NextResponse.json({ error: FORBIDDEN }, { status: 403 }) };
  return { auth };
}

/** Campanha + contatos (filtro por situação, 50 por página). */
export async function GET(request: Request, { params }: Context) {
  const { auth, response } = await manager();
  if (!auth) return response;
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const result = await getCampaign(auth.tenantId, id, { status: query.get('status'), page: Number(query.get('page')) || 0 });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ data: result });
}

/** action: start | pause | finish | requeue (statuses) | settings. */
export async function PATCH(request: Request, { params }: Context) {
  const { auth, response } = await manager();
  if (!auth) return response;
  const { id } = await params;
  const result = await campaignAction(auth.tenantId, id, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { auth, response } = await manager();
  if (!auth) return response;
  const { id } = await params;
  const result = await deleteCampaign(auth.tenantId, id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}
