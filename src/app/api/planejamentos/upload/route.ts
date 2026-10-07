import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile } from '@/lib/session';

export const runtime = 'nodejs';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'planejamentos.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Campo obrigatório: file.' }, { status: 400 });
    }

    // O bucket é público: SVG (que pode carregar script) fica de fora.
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Envie uma imagem PNG, JPG, WEBP ou GIF.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'A imagem passa de 8 MB. Envie uma menor.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = (file.name || 'imagem').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${auth.tenantId}/${auth.profile.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('planning-media')
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `Falha ao enviar imagem: ${uploadError.message}` }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from('planning-media').getPublicUrl(storagePath);
    return NextResponse.json({ success: true, data: { url: data.publicUrl } }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha no envio da imagem.' },
      { status: 500 }
    );
  }
}
