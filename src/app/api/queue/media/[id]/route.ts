import { NextResponse } from 'next/server';
import { requireQueueDisplayManager } from '@/lib/queue-display-access';
import { deleteDisplayMedia, updateDisplayMedia } from '@/services/queue-display.service';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireQueueDisplayManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await updateDisplayMedia(id, {
    title: typeof body?.title === 'string' ? body.title : undefined,
    durationSeconds: body?.durationSeconds !== undefined ? Number(body.durationSeconds) : undefined,
    active: typeof body?.active === 'boolean' ? body.active : undefined,
  });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireQueueDisplayManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const result = await deleteDisplayMedia(id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
