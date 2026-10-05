import { NextResponse } from 'next/server';
import { supportViewer } from '@/lib/support-server/request';
import { getTicket, updateTicket } from '@/services/support.service';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const viewer = await supportViewer();
  if ('error' in viewer) return NextResponse.json({ error: viewer.error.message }, { status: viewer.error.status });

  const result = await getTicket(viewer, (await params).id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}

/** Atendimento: situação, prioridade, categoria e responsável. */
export async function PATCH(request: Request, { params }: Context) {
  const viewer = await supportViewer();
  if ('error' in viewer) return NextResponse.json({ error: viewer.error.message }, { status: viewer.error.status });

  const result = await updateTicket(viewer, (await params).id, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
