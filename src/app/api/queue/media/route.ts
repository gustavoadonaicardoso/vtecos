import { NextResponse } from 'next/server';
import { requireQueueDisplayManager } from '@/lib/queue-display-access';
import { createDisplayMedia, getDisplayConfig, listDisplayMedia } from '@/services/queue-display.service';

/** Lista completa (inclusive pausadas) + rotina, para a tela de configuração. */
export async function GET() {
  const auth = await requireQueueDisplayManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const [media, config] = await Promise.all([listDisplayMedia(auth.tenantId, false), getDisplayConfig(auth.tenantId)]);
  if (!media.success) return NextResponse.json({ error: media.error }, { status: 400 });
  return NextResponse.json({ success: true, data: { media: media.data, config } });
}

/** Registra uma mídia já enviada ao Storage pela URL assinada. */
export async function POST(request: Request) {
  const auth = await requireQueueDisplayManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const type = body?.type === 'video' ? 'video' : body?.type === 'image' ? 'image' : null;
  if (!type || typeof body?.path !== 'string') return NextResponse.json({ error: 'Mídia inválida.' }, { status: 400 });

  const result = await createDisplayMedia(auth.tenantId, {
    path: body.path,
    type,
    title: typeof body.title === 'string' ? body.title : '',
    durationSeconds: Number(body.durationSeconds) || 10,
  });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
}
