import type { PostInput } from '@/services/social.service';
import type { SocialMediaItem } from '@/types';
import { MAX_IMAGES_PER_POST } from '@/lib/social/rules';

const MAX_CAPTION_LENGTH = 5000;

/** Só aceita imagens do nosso próprio bucket -- o servidor publica o que estiver aqui em nome da empresa. */
function isOwnMediaUrl(url: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base) && url.startsWith(`${base}/storage/v1/object/public/social-media/`);
}

export function parsePostInput(body: any): { input: PostInput } | { error: string } {
  const caption = typeof body?.caption === 'string' ? body.caption : '';
  if (caption.length > MAX_CAPTION_LENGTH) return { error: 'Legenda longa demais.' };

  const rawMedia = Array.isArray(body?.media) ? body.media : [];
  if (rawMedia.length > MAX_IMAGES_PER_POST) return { error: `No máximo ${MAX_IMAGES_PER_POST} imagens por post.` };

  const media: SocialMediaItem[] = [];
  for (const item of rawMedia) {
    if (typeof item?.url !== 'string' || !isOwnMediaUrl(item.url)) {
      return { error: 'Imagem inválida: envie as imagens pelo próprio criador de post.' };
    }
    media.push({ url: item.url, width: Number(item.width) || 0, height: Number(item.height) || 0 });
  }

  const accountIds = Array.isArray(body?.accountIds)
    ? body.accountIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];

  let scheduledAt: string | null = null;
  if (body?.scheduledAt) {
    const date = new Date(body.scheduledAt);
    if (Number.isNaN(date.getTime())) return { error: 'Data de agendamento inválida.' };
    scheduledAt = date.toISOString();
  }

  const projectId = typeof body?.projectId === 'string' && body.projectId ? body.projectId : null;

  return { input: { caption, media, scheduledAt, projectId, accountIds } };
}
