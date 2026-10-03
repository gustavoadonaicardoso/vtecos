import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { MetaGraphError } from '@/lib/social/meta-graph';
import { cached, engagementScore, fetchAccountInsights, fetchTargetInsights } from '@/lib/social/insights';
import { getAccountsWithTokens, listPublishedTargets, markAccountError } from '@/services/social.service';
import type { SocialAccountInsights, SocialTopPost } from '@/types';

export const runtime = 'nodejs';

const ALLOWED_DAYS = [7, 30];
const TOP_POSTS_SAMPLE = 12;

export async function GET(request: Request) {
  const auth = await requireActiveProfile({ module: 'social' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const params = new URL(request.url).searchParams;
  const accountId = params.get('accountId') || '';
  const days = ALLOWED_DAYS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;

  const [account] = await getAccountsWithTokens(auth.tenantId, [accountId]);
  if (!account || account.status === 'disconnected' || !account.access_token) {
    return NextResponse.json({ error: 'Conta não encontrada ou desconectada.' }, { status: 404 });
  }

  try {
    const data = await cached<SocialAccountInsights>(`account:${account.id}:${days}`, async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const [overview, targets] = await Promise.all([
        fetchAccountInsights(account, days),
        listPublishedTargets(auth.tenantId, account.id, since, TOP_POSTS_SAMPLE),
      ]);

      const topPosts: SocialTopPost[] = await Promise.all(
        targets.map(async (target) => ({
          postId: target.post?.id || '',
          targetId: target.id,
          caption: target.post?.caption || '',
          thumbnail: target.post?.media?.[0]?.url || null,
          permalink: target.permalink,
          publishedAt: target.published_at,
          metrics: await fetchTargetInsights(account, target),
        }))
      );
      topPosts.sort((a, b) => engagementScore(b.metrics) - engagementScore(a.metrics));

      return {
        accountId: account.id,
        days,
        totals: overview.totals,
        series: overview.series,
        topPosts,
        fetchedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof MetaGraphError && error.tokenInvalid) {
      await markAccountError(auth.tenantId, account.id, error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[social] falha ao buscar insights:', error);
    return NextResponse.json({ error: 'Não foi possível buscar os insights agora. Tente de novo em instantes.' }, { status: 502 });
  }
}
