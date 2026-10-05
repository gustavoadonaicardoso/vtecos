import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { deleteBanner, saveBanner } from '@/services/banners.service';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await saveBanner((await params).id, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await deleteBanner((await params).id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
