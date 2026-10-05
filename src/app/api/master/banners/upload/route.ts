import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { uploadBannerImage } from '@/services/banners.service';

export const runtime = 'nodejs';

/** Imagem de fundo do banner (bucket público platform-assets). */
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Escolha uma imagem.' }, { status: 400 });
  const result = await uploadBannerImage({ buffer: Buffer.from(await file.arrayBuffer()), type: file.type, size: file.size });
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result });
}
