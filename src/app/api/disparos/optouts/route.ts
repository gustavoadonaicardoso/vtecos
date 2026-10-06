import { NextResponse } from 'next/server';
import { requireCampaignUser } from '@/lib/disparos/auth';
import { addOptout, listOptouts, removeOptout } from '@/services/disparos.service';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await listOptouts(auth.tenantId) });
}

// POST { phone } -- tira um número das campanhas (pedido feito por outro canal).
export async function POST(request: Request) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const result = await addOptout(auth.tenantId, body.phone, `Adicionado por ${auth.profile.name}`);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

// DELETE ?id= -- o contato volta a poder receber campanhas.
export async function DELETE(request: Request) {
  const auth = await requireCampaignUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Registro inválido.' }, { status: 400 });
  await removeOptout(auth.tenantId, id);
  return NextResponse.json({ ok: true });
}
