/**
 * Regras de publicação da Meta, sem nenhuma dependência de servidor:
 * usadas tanto pelo criador de post (avisos ao vivo) quanto pelas rotas
 * (validação final antes de agendar/publicar).
 */
import type { SocialMediaItem, SocialPlatform } from '@/types';

export const INSTAGRAM_CAPTION_LIMIT = 2200;
export const INSTAGRAM_HASHTAG_LIMIT = 30;
export const MAX_IMAGES_PER_POST = 10;
/** Proporção aceita no feed do Instagram: de 4:5 (retrato) até 1.91:1 (paisagem). */
export const INSTAGRAM_MIN_RATIO = 0.8;
export const INSTAGRAM_MAX_RATIO = 1.91;

export function countHashtags(caption: string) {
  return (caption.match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

export function isInstagramRatioValid(item: Pick<SocialMediaItem, 'width' | 'height'>) {
  if (!item.width || !item.height) return true;
  const ratio = item.width / item.height;
  // Tolerância pequena pra arredondamento de 1080x1350 etc.
  return ratio >= INSTAGRAM_MIN_RATIO - 0.01 && ratio <= INSTAGRAM_MAX_RATIO + 0.01;
}

/** Erros que impedem agendar/publicar. Lista vazia = pode seguir. */
export function validatePostForPublishing(input: {
  caption: string;
  media: SocialMediaItem[];
  platforms: SocialPlatform[];
}): string[] {
  const errors: string[] = [];
  const { caption, media, platforms } = input;

  if (platforms.length === 0) errors.push('Escolha pelo menos uma conta de destino.');
  if (media.length > MAX_IMAGES_PER_POST) errors.push(`No máximo ${MAX_IMAGES_PER_POST} imagens por post.`);

  if (platforms.includes('instagram')) {
    if (media.length === 0) errors.push('O Instagram exige pelo menos uma imagem.');
    if (caption.length > INSTAGRAM_CAPTION_LIMIT) {
      errors.push(`A legenda passa do limite do Instagram (${INSTAGRAM_CAPTION_LIMIT} caracteres).`);
    }
    if (countHashtags(caption) > INSTAGRAM_HASHTAG_LIMIT) {
      errors.push(`O Instagram aceita no máximo ${INSTAGRAM_HASHTAG_LIMIT} hashtags.`);
    }
    if (media.some((item) => !isInstagramRatioValid(item))) {
      errors.push('Alguma imagem está fora da proporção aceita pelo Instagram (entre 4:5 e 1.91:1).');
    }
  }

  if (platforms.includes('facebook') && media.length === 0 && !caption.trim()) {
    errors.push('Post sem imagem precisa de texto.');
  }

  return errors;
}
