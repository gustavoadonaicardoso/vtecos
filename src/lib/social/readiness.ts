import { validatePostForPublishing } from '@/lib/social/rules';
import { getAccountsWithTokens } from '@/services/social.service';
import type { SocialPlatform, SocialPost } from '@/types';

/**
 * Confere se o post pode sair agora (contas conectadas + regras das redes).
 * Devolve a mensagem do problema, ou null se estiver tudo certo. Usado ao
 * enviar e ao aprovar, pra não aprovar algo que já nasceria falhando.
 */
export async function checkPostReady(post: SocialPost): Promise<string | null> {
  const accounts = await getAccountsWithTokens(post.targets.map((target) => target.account_id));
  if (accounts.some((account) => account.status === 'disconnected')) {
    return 'Uma das contas de destino está desconectada. Reconecte ou remova ela do post.';
  }

  const platforms = [...new Set(accounts.map((account) => account.platform))] as SocialPlatform[];
  const errors = validatePostForPublishing({ caption: post.caption, media: post.media, platforms });
  return errors.length > 0 ? errors.join(' ') : null;
}

export function formatServerDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
