import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { reorderBanners } from '@/services/banners.service';

/** Ordem do carrossel: { ids: [...] } na ordem desejada. */
export async function PUT(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  await reorderBanners(Array.isArray(body?.ids) ? body.ids : []);
  return NextResponse.json({ success: true });
}
