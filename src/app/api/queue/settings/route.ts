import { NextResponse } from 'next/server';
import { requireQueueManager } from '@/lib/queue-display-access';
import { saveQueueSettings } from '@/services/queue.service';

/** Nome, logo, cor, guichês, preferencial e voz da TV (admin e gerente). */
export async function PUT(request: Request) {
  const auth = await requireQueueManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  const result = await saveQueueSettings({ id: auth.tenantId, name: auth.tenantName }, auth.profile, body);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}
