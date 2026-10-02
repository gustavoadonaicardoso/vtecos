/**
 * ============================================================
 * VÓRTICE CRM — Publicador de posts (Instagram/Facebook)
 * ============================================================
 * Único caminho de publicação: usado pelo agendador (posts vencidos)
 * e pelo "Publicar agora"/"Tentar de novo" das rotas. Sempre começa
 * reivindicando o post (UPDATE condicional), então chamadas
 * simultâneas nunca publicam o mesmo post duas vezes.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { MetaGraphError, publishToFacebook, publishToInstagram } from '@/lib/social/meta-graph';
import {
  claimPostForPublishing,
  getAccountsWithTokens,
  getPost,
  markAccountError,
  notifyUser,
  setPostStatus,
  updateTarget,
} from '@/services/social.service';
import type { SocialPostStatus } from '@/types';

/** Publicado mais de 10 min depois do horário marcado conta como "com atraso". */
const LATE_THRESHOLD_MS = 10 * 60_000;

export async function claimAndPublishPost(
  postId: string,
  fromStatuses: SocialPostStatus[],
  options: { detectLate?: boolean } = {}
): Promise<{ claimed: boolean; status?: SocialPostStatus }> {
  const claimed = await claimPostForPublishing(postId, fromStatuses);
  if (!claimed) return { claimed: false };

  const post = await getPost(postId);
  if (!post) return { claimed: true, status: 'failed' };

  const pendingTargets = post.targets.filter((target) => target.status !== 'published');
  const accounts = await getAccountsWithTokens(pendingTargets.map((target) => target.account_id));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const imageUrls = post.media.map((item) => item.url);

  for (const target of pendingTargets) {
    const account = accountsById.get(target.account_id);
    if (!account || account.status === 'disconnected' || !account.access_token) {
      await updateTarget(target.id, { status: 'failed', error: 'Conta desconectada. Reconecte em Redes Sociais → Contas.' });
      continue;
    }

    try {
      const result =
        account.platform === 'instagram'
          ? await publishToInstagram({
              igUserId: account.external_id,
              token: account.access_token,
              caption: post.caption,
              imageUrls,
            })
          : await publishToFacebook({
              pageId: account.page_id,
              token: account.access_token,
              caption: post.caption,
              imageUrls,
            });

      await updateTarget(target.id, {
        status: 'published',
        external_id: result.externalId,
        permalink: result.permalink,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao publicar.';
      await updateTarget(target.id, { status: 'failed', error: message });
      if (err instanceof MetaGraphError && err.tokenInvalid) {
        await markAccountError(account.id, message);
      }
    }
  }

  const late = Boolean(options.detectLate && claimed.scheduled_at) &&
    Date.now() - new Date(claimed.scheduled_at as string).getTime() > LATE_THRESHOLD_MS;
  const status = await consolidatePostStatus(postId, late);
  await notifyAuthor(claimed.created_by, status, post.caption);
  return { claimed: true, status };
}

/** Recalcula o status do post a partir dos destinos e grava. */
export async function consolidatePostStatus(postId: string, late = false): Promise<SocialPostStatus> {
  const { data: targets } = await supabaseAdmin
    .from('social_post_targets')
    .select('status')
    .eq('post_id', postId);

  const all = targets || [];
  const publishedCount = all.filter((target) => target.status === 'published').length;

  let status: SocialPostStatus;
  if (all.length > 0 && publishedCount === all.length) status = late ? 'published_late' : 'published';
  else if (publishedCount > 0) status = 'partial';
  else status = 'failed';

  await setPostStatus(postId, status, {
    publishing_started_at: null,
    ...(publishedCount > 0 ? { published_at: new Date().toISOString() } : {}),
  });
  return status;
}

async function notifyAuthor(userId: string | null, status: SocialPostStatus, caption: string) {
  const preview = caption.trim().slice(0, 60) || 'Post sem legenda';
  if (status === 'published' || status === 'published_late') {
    await notifyUser(userId, 'Post publicado', `"${preview}" foi publicado com sucesso.`);
  } else if (status === 'partial') {
    await notifyUser(userId, 'Post publicado em parte', `"${preview}" saiu em algumas redes e falhou em outras. Veja os detalhes.`);
  } else {
    await notifyUser(userId, 'Falha ao publicar post', `"${preview}" não foi publicado. Veja o erro e tente de novo.`);
  }
}
