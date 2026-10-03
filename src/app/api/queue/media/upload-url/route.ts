import { NextResponse } from 'next/server';
import { requireQueueDisplayManager } from '@/lib/queue-display-access';
import { createUploadUrl } from '@/services/queue-display.service';

/**
 * Gera uma URL assinada para o navegador enviar o arquivo direto ao
 * Storage -- vídeos podem ter dezenas de MB e não devem passar pelo app.
 */
export async function POST(request: Request) {
  const auth = await requireQueueDisplayManager();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const result = await createUploadUrl(
    auth.tenantId,
    typeof body?.fileName === 'string' ? body.fileName : '',
    typeof body?.contentType === 'string' ? body.contentType : '',
    Number(body?.size)
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result });
}
