import { NextResponse } from 'next/server';
import { requireQueueManager } from '@/lib/queue-display-access';
import { uploadQueueLogo } from '@/services/queue.service';

export const runtime = 'nodejs';

/** Logo que aparece no totem e na TV. */
export async function POST(request: Request) {
  const auth = await requireQueueManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Escolha uma imagem.' }, { status: 400 });
  const result = await uploadQueueLogo(auth.tenantId, { buffer: Buffer.from(await file.arrayBuffer()), type: file.type, size: file.size });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}
