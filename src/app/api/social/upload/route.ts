import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { Jimp, JimpMime } from 'jimp';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile } from '@/lib/session';

export const runtime = 'nodejs';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
/** O Instagram nunca exibe acima de 1440px de largura; reduzir mantém o JPEG abaixo do limite de 8MB. */
const MAX_WIDTH = 1440;

export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'social' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Campo obrigatório: file.' }, { status: 400 });
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Envie imagens JPG ou PNG.' }, { status: 400 });
    }
    if (file.size > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'Imagem acima de 15MB.' }, { status: 400 });
    }

    const source = await Jimp.read(Buffer.from(await file.arrayBuffer()));
    if (source.bitmap.width > MAX_WIDTH) source.resize({ w: MAX_WIDTH });

    // O Instagram só aceita JPEG. PNG com transparência ganha fundo branco
    // (JPEG não tem canal alfa; sem isso o transparente vira preto).
    const { width, height } = source.bitmap;
    const canvas = new Jimp({ width, height, color: 0xffffffff });
    canvas.composite(source, 0, 0);
    const jpeg = await canvas.getBuffer(JimpMime.jpeg, { quality: 90 });

    const storagePath = `${auth.tenantId}/${auth.profile.id}/${Date.now()}-${randomUUID()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('social-media')
      .upload(storagePath, jpeg, { contentType: 'image/jpeg', upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `Falha ao enviar imagem: ${uploadError.message}` }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from('social-media').getPublicUrl(storagePath);
    return NextResponse.json({ success: true, data: { url: data.publicUrl, width, height } });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? `Não foi possível processar a imagem: ${error.message}` : 'Falha ao processar a imagem.' },
      { status: 500 }
    );
  }
}
