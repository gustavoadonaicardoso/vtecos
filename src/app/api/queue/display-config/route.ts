import { NextResponse } from 'next/server';
import { requireQueueDisplayManager } from '@/lib/queue-display-access';
import { saveDisplayConfig } from '@/services/queue-display.service';

export async function PUT(request: Request) {
  const auth = await requireQueueDisplayManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 });

  const result = await saveDisplayConfig(body);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data });
}
