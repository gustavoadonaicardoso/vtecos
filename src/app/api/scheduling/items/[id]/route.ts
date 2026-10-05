import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { deleteItem, updateItem } from '@/services/scheduling.service';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireActiveProfile({ module: 'agendamento' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const result = await updateItem(auth.tenantId, auth.profile, id, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireActiveProfile({ module: 'agendamento' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const result = await deleteItem(auth.tenantId, auth.profile, id);
  if (result !== true) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
