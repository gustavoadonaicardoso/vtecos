import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { safeContentType } from '@/lib/safe-content-type';
import { getAttachment } from '@/services/email.service';

export const runtime = 'nodejs';

// GET ?message=ID&index=N -- baixa um anexo (sempre como download).
export async function GET(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const search = new URL(request.url).searchParams;
  const result = await getAttachment(auth, search.get('message') || '', Math.max(0, Math.floor(Number(search.get('index')) || 0)));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const name = result.data.name.replace(/["\r\n]/g, '_');
  return new NextResponse(new Uint8Array(result.data.content), {
    headers: {
      'Content-Type': safeContentType(result.data.type),
      'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
