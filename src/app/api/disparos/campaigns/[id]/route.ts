import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { deleteCampaign, getCampaign, updateDraft, type ContactFilter } from '@/services/disparos.service';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };
const FILTERS: ContactFilter[] = ['all', 'pending', 'sent', 'failed', 'skipped', 'replied'];

// GET ?filter=&q=&page= -- campanha, contadores e uma página de contatos.
export async function GET(request: Request, { params }: Params) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const filter = FILTERS.includes(search.get('filter') as ContactFilter) ? (search.get('filter') as ContactFilter) : 'all';
  const result = await getCampaign(auth.tenantId, id, { filter, q: search.get('q') || '', page: Number(search.get('page')) || 0 });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}

// PATCH -- edita mensagem e configurações (rascunho, agendada ou pausada).
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const result = await updateDraft(auth.tenantId, id, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const result = await deleteCampaign(auth.tenantId, auth.profile, id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
