import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { Jimp, JimpMime } from 'jimp';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile } from '@/lib/session';

export const runtime = 'nodejs';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const SIZE = 256;
const BUCKET = 'avatars';

/** Caminho no bucket a partir da URL pública (só fotos desta empresa). */
function storagePathOf(url: string | null | undefined, tenantId: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url ? url.indexOf(marker) : -1;
  if (index < 0) return null;
  const path = decodeURIComponent(url!.slice(index + marker.length).split('?')[0]);
  return path.startsWith(`${tenantId}/`) ? path : null;
}

async function setAvatar(tenantId: string, profileId: string, avatarUrl: string | null) {
  return supabaseAdmin.from('profiles').update({ avatar_url: avatarUrl }).eq('tenant_id', tenantId).eq('id', profileId);
}

/**
 * POST: troca a foto de perfil de quem está logado. A imagem é cortada
 * em quadrado de 256px e salva como JPEG no bucket "avatars" -- a URL
 * vai para profiles.avatar_url (menu, chat, equipe e Início).
 */
export async function POST(request: Request) {
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Campo obrigatório: file.' }, { status: 400 });
    if (!ACCEPTED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Envie uma imagem JPG, PNG ou GIF.' }, { status: 400 });
    if (file.size > MAX_INPUT_BYTES) return NextResponse.json({ error: 'A foto precisa ter no máximo 5 MB.' }, { status: 400 });

    const source = await Jimp.read(Buffer.from(await file.arrayBuffer()));
    source.cover({ w: SIZE, h: SIZE });
    // Fundo branco para PNG transparente (JPEG não tem transparência).
    const canvas = new Jimp({ width: SIZE, height: SIZE, color: 0xffffffff });
    canvas.composite(source, 0, 0);
    const jpeg = await canvas.getBuffer(JimpMime.jpeg, { quality: 85 });

    const path = `${auth.tenantId}/${auth.profile.id}-${randomUUID()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `Falha ao enviar a foto: ${uploadError.message}. Confira se a migration 202610060001 já rodou.` }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const { error } = await setAvatar(auth.tenantId, auth.profile.id, data.publicUrl);
    if (error) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // A foto anterior não é mais usada em lugar nenhum.
    const previous = storagePathOf(auth.profile.avatar_url, auth.tenantId);
    if (previous) await supabaseAdmin.storage.from(BUCKET).remove([previous]);

    return NextResponse.json({ data: { avatar_url: data.publicUrl } });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? `Não foi possível processar a foto: ${error.message}` : 'Falha ao processar a foto.' },
      { status: 500 }
    );
  }
}

// DELETE: remove a foto (volta às iniciais do nome).
export async function DELETE() {
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { error } = await setAvatar(auth.tenantId, auth.profile.id, null);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const previous = storagePathOf(auth.profile.avatar_url, auth.tenantId);
  if (previous) await supabaseAdmin.storage.from(BUCKET).remove([previous]);
  return NextResponse.json({ data: { avatar_url: null } });
}
