import { NextResponse } from 'next/server';
import { requireQueueDisplayManager } from '@/lib/queue-display-access';
import { reorderDisplayMedia } from '@/services/queue-display.service';

export async function PUT(request: Request) {
  const auth = await requireQueueDisplayManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string').slice(0, 200) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Ordem inválida.' }, { status: 400 });

  const result = await reorderDisplayMedia(auth.tenantId, ids);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
