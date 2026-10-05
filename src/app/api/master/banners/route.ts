import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { listAllBanners, saveBanner } from '@/services/banners.service';

/** Painel Master: todos os banners (inclusive desligados e agendados). */
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    return NextResponse.json({ data: await listAllBanners() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar os banners.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await saveBanner(null, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result }, { status: 201 });
}
