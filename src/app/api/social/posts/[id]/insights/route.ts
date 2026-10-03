import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { MetaGraphError } from '@/lib/social/meta-graph';
import { fetchTargetInsights } from '@/lib/social/insights';
import { getAccountsWithTokens, getPost } from '@/services/social.service';
import type { SocialTargetInsights } from '@/types';

export const runtime = 'nodejs';

/** Resultados de um post já publicado, por conta de destino. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'social' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { id } = await params;
  const post = await getPost(auth.tenantId, id);
  if (!post) return NextResponse.json({ error: 'Post não encontrado.' }, { status: 404 });

  const published = post.targets.filter((target) => target.status === 'published' && target.external_id);
  const accounts = await getAccountsWithTokens(auth.tenantId, published.map((target) => target.account_id));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  const data: SocialTargetInsights[] = await Promise.all(
    published.map(async (target) => {
      const account = accountsById.get(target.account_id);
      if (!account || account.status === 'disconnected' || !account.access_token) {
        return { targetId: target.id, accountId: target.account_id, metrics: null, error: 'Conta desconectada.' };
      }
      try {
        const metrics = await fetchTargetInsights(account, { id: target.id, external_id: target.external_id! });
        return { targetId: target.id, accountId: target.account_id, metrics, error: null };
      } catch (error) {
        const message = error instanceof MetaGraphError ? error.message : 'Falha ao consultar a Meta.';
        return { targetId: target.id, accountId: target.account_id, metrics: null, error: message };
      }
    })
  );

  return NextResponse.json({ success: true, data });
}
