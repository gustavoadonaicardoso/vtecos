/**
 * ============================================================
 * VÓRTICE CRM — Insights do Instagram/Facebook
 * ============================================================
 * A Meta aposenta e renomeia métricas com frequência (ex.: "impressions"
 * virou "views" no Instagram). Por isso cada métrica é pedida sozinha,
 * com alternativas em ordem de preferência: a que a Meta recusar vira
 * null ("—" na tela) em vez de derrubar o painel inteiro. Só erro de
 * token invalida a consulta, porque aí a conta precisa ser reconectada.
 *
 * Resultados ficam 5 min em memória: insights mudam devagar e a Meta
 * limita o número de chamadas por conta.
 * Server-only.
 * ============================================================
 */

import { MetaGraphError, graphRequest } from '@/lib/social/meta-graph';
import type { AccountWithToken, PublishedTargetRow } from '@/services/social.service';
import type { SocialInsightsPoint, SocialMetrics } from '@/types';

const CACHE_TTL_MS = 5 * 60_000;

const globalForInsights = globalThis as typeof globalThis & {
  __vtecSocialInsightsCache?: Map<string, { expiresAt: number; value: unknown }>;
};
const cache = (globalForInsights.__vtecSocialInsightsCache ??= new Map());

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  if (cache.size > 500) {
    for (const [entryKey, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(entryKey);
  }
  return value;
}

export function emptyMetrics(): SocialMetrics {
  return {
    followers: null,
    reach: null,
    views: null,
    interactions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    follows: null,
  };
}

/** Engole erros de métrica; só deixa passar token inválido. */
async function tolerant<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof MetaGraphError && error.tokenInvalid) throw error;
    return null;
  }
}

/** Tenta cada nome de métrica até um funcionar. */
async function firstAvailable<T>(names: string[], load: (name: string) => Promise<T | null>): Promise<T | null> {
  for (const name of names) {
    const value = await tolerant(() => load(name));
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface InsightValue {
  value: unknown;
  end_time?: string;
}
interface InsightsResponse {
  data: Array<{ name: string; values?: InsightValue[]; total_value?: { value: unknown } }>;
}

function periodRange(days: number) {
  const until = Math.floor(Date.now() / 1000);
  // A Meta recusa intervalos maiores que 30 dias no Instagram; a folga evita bater no limite exato.
  const since = until - days * 86_400 + 120;
  return { since: String(since), until: String(until) };
}

function toSeries(values: InsightValue[] | undefined): SocialInsightsPoint[] {
  return (values || [])
    .map((point) => ({ date: (point.end_time || '').slice(0, 10), value: toNumber(point.value) ?? 0 }))
    .filter((point) => point.date);
}

// ── Contas ─────────────────────────────────────────────────────

async function instagramAccountInsights(account: AccountWithToken, days: number) {
  const { access_token: token, external_id: igId } = account;
  const range = periodRange(days);

  const total = (metric: string) =>
    tolerant(async () => {
      const result = await graphRequest<InsightsResponse>(
        'GET',
        `/${igId}/insights`,
        { metric, period: 'day', metric_type: 'total_value', ...range },
        token
      );
      return toNumber(result.data?.[0]?.total_value?.value);
    });

  const [profile, reach, views, interactions, likes, comments, shares, saves, seriesResponse] = await Promise.all([
    tolerant(() => graphRequest<{ followers_count?: number }>('GET', `/${igId}`, { fields: 'followers_count' }, token)),
    total('reach'),
    total('views'),
    total('total_interactions'),
    total('likes'),
    total('comments'),
    total('shares'),
    total('saves'),
    tolerant(() => graphRequest<InsightsResponse>('GET', `/${igId}/insights`, { metric: 'reach', period: 'day', ...range }, token)),
  ]);

  const totals: SocialMetrics = {
    ...emptyMetrics(),
    followers: toNumber(profile?.followers_count),
    reach,
    views,
    interactions,
    likes,
    comments,
    shares,
    saves,
  };
  return { totals, series: toSeries(seriesResponse?.data?.[0]?.values) };
}

async function facebookAccountInsights(account: AccountWithToken, days: number) {
  const { access_token: token, external_id: pageId } = account;
  const range = periodRange(days);

  const daily = (name: string) =>
    graphRequest<InsightsResponse>('GET', `/${pageId}/insights`, { metric: name, period: 'day', ...range }, token).then(
      (result) => (result.data?.[0]?.values ? result.data[0].values : null)
    );
  const sum = (values: InsightValue[] | null) =>
    values ? values.reduce((acc, point) => acc + (toNumber(point.value) ?? 0), 0) : null;

  // Em 2025 a Meta trocou as métricas de "impressions" das Páginas por "media_view";
  // as antigas ficam como alternativa para versões anteriores da API.
  const [profile, reachValues, viewValues, engagementValues, followValues] = await Promise.all([
    tolerant(() =>
      graphRequest<{ followers_count?: number; fan_count?: number }>('GET', `/${pageId}`, { fields: 'followers_count,fan_count' }, token)
    ),
    firstAvailable(['page_total_media_view_unique', 'page_impressions_unique'], daily),
    firstAvailable(['page_media_view', 'page_impressions'], daily),
    firstAvailable(['page_post_engagements'], daily),
    firstAvailable(['page_daily_follows_unique', 'page_fan_adds_unique'], daily),
  ]);

  const totals: SocialMetrics = {
    ...emptyMetrics(),
    followers: toNumber(profile?.followers_count) ?? toNumber(profile?.fan_count),
    reach: sum(reachValues),
    views: sum(viewValues),
    interactions: sum(engagementValues),
    follows: sum(followValues),
  };
  return { totals, series: toSeries(reachValues || viewValues || undefined) };
}

export function fetchAccountInsights(account: AccountWithToken, days: number) {
  return account.platform === 'instagram' ? instagramAccountInsights(account, days) : facebookAccountInsights(account, days);
}

// ── Posts ──────────────────────────────────────────────────────

async function instagramMediaInsights(mediaId: string, token: string): Promise<SocialMetrics> {
  const metric = (name: string) =>
    tolerant(async () => {
      const result = await graphRequest<InsightsResponse>('GET', `/${mediaId}/insights`, { metric: name }, token);
      return toNumber(result.data?.[0]?.values?.[0]?.value ?? result.data?.[0]?.total_value?.value);
    });

  const [fields, reach, views, interactions, saves, shares] = await Promise.all([
    tolerant(() => graphRequest<{ like_count?: number; comments_count?: number }>('GET', `/${mediaId}`, { fields: 'like_count,comments_count' }, token)),
    metric('reach'),
    metric('views'),
    metric('total_interactions'),
    metric('saved'),
    metric('shares'),
  ]);

  return {
    ...emptyMetrics(),
    reach,
    views,
    interactions,
    likes: toNumber(fields?.like_count),
    comments: toNumber(fields?.comments_count),
    saves,
    shares,
  };
}

async function facebookPostInsights(postId: string, token: string): Promise<SocialMetrics> {
  const lifetime = (name: string) =>
    graphRequest<InsightsResponse>('GET', `/${postId}/insights`, { metric: name }, token).then((result) =>
      toNumber(result.data?.[0]?.values?.[0]?.value)
    );

  const [fields, reach, views] = await Promise.all([
    tolerant(() =>
      graphRequest<{
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
        shares?: { count?: number };
      }>('GET', `/${postId}`, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares' }, token)
    ),
    firstAvailable(['post_total_media_view_unique', 'post_impressions_unique'], lifetime),
    firstAvailable(['post_media_view', 'post_impressions'], lifetime),
  ]);

  const likes = toNumber(fields?.reactions?.summary?.total_count);
  const comments = toNumber(fields?.comments?.summary?.total_count);
  const shares = toNumber(fields?.shares?.count) ?? (fields ? 0 : null);
  const known = [likes, comments, shares].filter((value): value is number => value !== null);

  return {
    ...emptyMetrics(),
    reach,
    views,
    likes,
    comments,
    shares,
    interactions: known.length > 0 ? known.reduce((acc, value) => acc + value, 0) : null,
  };
}

export function fetchTargetInsights(account: AccountWithToken, target: Pick<PublishedTargetRow, 'id' | 'external_id'>) {
  return cached(`target:${target.id}`, () =>
    account.platform === 'instagram'
      ? instagramMediaInsights(target.external_id, account.access_token)
      : facebookPostInsights(target.external_id, account.access_token)
  );
}

/** Pontuação para o ranking: interações; empate desfeito pelo alcance. */
export function engagementScore(metrics: SocialMetrics) {
  const interactions =
    metrics.interactions ?? (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0) + (metrics.saves ?? 0);
  return interactions * 1_000_000 + (metrics.reach ?? 0);
}
