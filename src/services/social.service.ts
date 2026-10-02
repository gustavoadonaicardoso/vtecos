/**
 * ============================================================
 * VÓRTICE CRM — Redes Sociais Service
 * ============================================================
 * Acesso ao banco do módulo de Redes Sociais. As tabelas social_*
 * ficam trancadas por RLS (sem policy), então tudo passa pelo
 * supabaseAdmin -- e por isso este arquivo só pode ser importado por
 * rotas /api e pelo agendador, nunca por código do navegador.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { MetaPageWithInstagram } from '@/lib/social/meta-graph';
import type {
  ServiceResult,
  SocialAccount,
  SocialMediaItem,
  SocialPost,
  SocialPostStatus,
  SocialPlatform,
  SocialProjectOption,
  SocialSettings,
} from '@/types';

const ACCOUNT_PUBLIC_COLUMNS =
  'id, platform, external_id, page_id, name, username, avatar_url, project_id, status, last_error, created_at';

const POST_WITH_TARGETS =
  '*, targets:social_post_targets(id, account_id, status, external_id, permalink, error, published_at)';

// ── Contas ─────────────────────────────────────────────────────

export async function listAccounts(): Promise<ServiceResult<SocialAccount[]>> {
  const { data, error } = await supabaseAdmin
    .from('social_accounts')
    .select(ACCOUNT_PUBLIC_COLUMNS)
    .neq('status', 'disconnected')
    .order('platform')
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as SocialAccount[] };
}

export interface AccountWithToken {
  id: string;
  platform: SocialPlatform;
  external_id: string;
  page_id: string;
  name: string;
  status: string;
  access_token: string;
}

/** Inclui o token: uso exclusivo do publicador, nunca devolver ao navegador. */
export async function getAccountsWithTokens(ids: string[]): Promise<AccountWithToken[]> {
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('social_accounts')
    .select('id, platform, external_id, page_id, name, status, access_token')
    .in('id', ids);
  return (data || []) as AccountWithToken[];
}

export async function saveConnectedPages(pages: MetaPageWithInstagram[], connectedBy: string) {
  const now = new Date().toISOString();
  const rows = pages.flatMap((page) => {
    const facebook = {
      platform: 'facebook',
      external_id: page.pageId,
      page_id: page.pageId,
      name: page.pageName,
      username: null,
      avatar_url: page.pageAvatar,
      access_token: page.pageToken,
      connected_by: connectedBy,
      status: 'active',
      last_error: null,
      updated_at: now,
    };
    if (!page.instagram) return [facebook];
    // A publicação no Instagram usa o token da Página à qual ele está vinculado.
    const instagram = {
      platform: 'instagram',
      external_id: page.instagram.id,
      page_id: page.pageId,
      name: page.instagram.name || page.instagram.username,
      username: page.instagram.username,
      avatar_url: page.instagram.avatar,
      access_token: page.pageToken,
      connected_by: connectedBy,
      status: 'active',
      last_error: null,
      updated_at: now,
    };
    return [facebook, instagram];
  });

  if (rows.length === 0) return { success: true, data: 0 } as ServiceResult<number>;

  const { error } = await supabaseAdmin
    .from('social_accounts')
    .upsert(rows, { onConflict: 'platform,external_id' });

  if (error) return { success: false, error: error.message } as ServiceResult<number>;
  return { success: true, data: rows.length } as ServiceResult<number>;
}

export async function disconnectAccount(id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin
    .from('social_accounts')
    .update({ status: 'disconnected', access_token: '', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function markAccountError(id: string, message: string) {
  await supabaseAdmin
    .from('social_accounts')
    .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
    .eq('id', id);
}

// ── Posts ──────────────────────────────────────────────────────

export interface PostFilters {
  from?: string;
  to?: string;
  status?: string;
  accountId?: string;
  projectId?: string;
}

export async function listPosts(filters: PostFilters = {}): Promise<ServiceResult<SocialPost[]>> {
  let query = supabaseAdmin
    .from('social_posts')
    .select(POST_WITH_TARGETS)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.from && filters.to) {
    query = query.or(
      `and(scheduled_at.gte.${filters.from},scheduled_at.lte.${filters.to}),` +
        `and(published_at.gte.${filters.from},published_at.lte.${filters.to})`
    );
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  let posts = (data || []) as SocialPost[];
  if (filters.accountId) {
    posts = posts.filter((post) => post.targets.some((target) => target.account_id === filters.accountId));
  }
  return { success: true, data: posts };
}

export async function getPost(id: string): Promise<SocialPost | null> {
  const { data } = await supabaseAdmin.from('social_posts').select(POST_WITH_TARGETS).eq('id', id).maybeSingle();
  return (data as SocialPost) || null;
}

export interface PostInput {
  caption: string;
  media: SocialMediaItem[];
  scheduledAt: string | null;
  projectId: string | null;
  accountIds: string[];
}

export async function createPost(input: PostInput, createdBy: string): Promise<ServiceResult<SocialPost>> {
  const { data: post, error } = await supabaseAdmin
    .from('social_posts')
    .insert([{
      caption: input.caption,
      media: input.media,
      scheduled_at: input.scheduledAt,
      project_id: input.projectId,
      created_by: createdBy,
      status: 'draft',
    }])
    .select('id')
    .single();

  if (error || !post) return { success: false, error: error?.message || 'Falha ao criar o post.' };

  const targetsResult = await replaceTargets(post.id, input.accountIds);
  if (!targetsResult.success) return { success: false, error: targetsResult.error };

  const created = await getPost(post.id);
  return created ? { success: true, data: created } : { success: false, error: 'Post criado, mas não foi possível relê-lo.' };
}

/** Troca os destinos ainda não publicados; destinos já publicados nunca são apagados. */
async function replaceTargets(postId: string, accountIds: string[]): Promise<ServiceResult> {
  const { data: existing } = await supabaseAdmin
    .from('social_post_targets')
    .select('id, account_id, status')
    .eq('post_id', postId);

  const published = new Set((existing || []).filter((t) => t.status === 'published').map((t) => t.account_id));
  const removable = (existing || []).filter((t) => t.status !== 'published').map((t) => t.id);

  if (removable.length > 0) {
    const { error } = await supabaseAdmin.from('social_post_targets').delete().in('id', removable);
    if (error) return { success: false, error: error.message };
  }

  const toInsert = [...new Set(accountIds)]
    .filter((accountId) => !published.has(accountId))
    .map((accountId) => ({ post_id: postId, account_id: accountId, status: 'pending' }));

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from('social_post_targets').insert(toInsert);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updatePost(id: string, input: PostInput): Promise<ServiceResult<SocialPost>> {
  const { error } = await supabaseAdmin
    .from('social_posts')
    .update({
      caption: input.caption,
      media: input.media,
      scheduled_at: input.scheduledAt,
      project_id: input.projectId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  const targetsResult = await replaceTargets(id, input.accountIds);
  if (!targetsResult.success) return { success: false, error: targetsResult.error };

  const updated = await getPost(id);
  return updated ? { success: true, data: updated } : { success: false, error: 'Post não encontrado.' };
}

export async function deletePost(id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from('social_posts').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function setPostStatus(
  id: string,
  status: SocialPostStatus,
  extra: Record<string, unknown> = {}
): Promise<ServiceResult> {
  const { error } = await supabaseAdmin
    .from('social_posts')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Muda o status só se o post ainda estiver num dos status esperados.
 * Devolve false se outra pessoa mexeu antes (ex.: dois aprovadores ao
 * mesmo tempo) -- quem chamou decide o que responder.
 */
export async function transitionPostStatus(
  id: string,
  fromStatuses: SocialPostStatus[],
  to: SocialPostStatus,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('social_posts')
    .update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .in('status', fromStatuses)
    .select('id')
    .maybeSingle();
  return Boolean(data);
}

/**
 * Troca o status para 'publishing' só se o post ainda estiver num dos
 * status esperados. É um UPDATE condicional: se dois processos tentarem
 * ao mesmo tempo, só um recebe a linha de volta -- o outro desiste. É
 * isso que garante que um post nunca é publicado duas vezes.
 */
export async function claimPostForPublishing(
  id: string,
  fromStatuses: SocialPostStatus[]
): Promise<{ id: string; scheduled_at: string | null; created_by: string | null } | null> {
  const { data } = await supabaseAdmin
    .from('social_posts')
    .update({
      status: 'publishing',
      publishing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', fromStatuses)
    .select('id, scheduled_at, created_by')
    .maybeSingle();
  return data || null;
}

export async function listDuePostIds(limit: number): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('social_posts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at')
    .limit(limit);
  return (data || []).map((row) => row.id);
}

export async function listStuckPublishingPostIds(olderThanMinutes: number): Promise<string[]> {
  const threshold = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from('social_posts')
    .select('id')
    .eq('status', 'publishing')
    .lt('publishing_started_at', threshold);
  return (data || []).map((row) => row.id);
}

export async function updateTarget(
  id: string,
  update: { status: 'published' | 'failed'; external_id?: string | null; permalink?: string | null; error?: string | null }
) {
  await supabaseAdmin
    .from('social_post_targets')
    .update({
      ...update,
      published_at: update.status === 'published' ? new Date().toISOString() : null,
    })
    .eq('id', id);
}

// ── Notificações ───────────────────────────────────────────────

export async function notifyUser(userId: string | null, title: string, content: string, link = '/social') {
  if (!userId) return;
  const { error } = await supabaseAdmin.from('system_notifications').insert([{
    user_id: userId,
    type: 'system',
    title,
    content,
    is_read: false,
    link,
  }]);
  if (error) console.error('[social] falha ao notificar usuário:', error.message);
}

/** Avisa todos os admins e gerentes ativos (quem pode aprovar posts). */
export async function notifyApprovers(title: string, content: string, link: string, exceptUserId?: string) {
  const { data: approvers, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .in('role', ['ADMIN', 'MANAGER'])
    .eq('status', 'ACTIVE');

  if (error || !approvers) {
    console.error('[social] falha ao listar aprovadores:', error?.message);
    return;
  }

  const rows = approvers
    .filter((approver) => approver.id !== exceptUserId)
    .map((approver) => ({ user_id: approver.id, type: 'task', title, content, is_read: false, link }));
  if (rows.length === 0) return;

  const { error: insertError } = await supabaseAdmin.from('system_notifications').insert(rows);
  if (insertError) console.error('[social] falha ao notificar aprovadores:', insertError.message);
}

// ── Configurações ──────────────────────────────────────────────

const SETTINGS_PROVIDER = 'social_settings';

export const DEFAULT_SOCIAL_SETTINGS: SocialSettings = {
  requireApproval: true,
  defaultAccountIds: [],
};

function normalizeSettings(raw: unknown): SocialSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<SocialSettings>;
  return {
    requireApproval: typeof value.requireApproval === 'boolean' ? value.requireApproval : DEFAULT_SOCIAL_SETTINGS.requireApproval,
    defaultAccountIds: Array.isArray(value.defaultAccountIds)
      ? value.defaultAccountIds.filter((id): id is string => typeof id === 'string').slice(0, 50)
      : [],
  };
}

export async function getSocialSettings(): Promise<SocialSettings> {
  const { data } = await supabaseAdmin
    .from('integrations_config')
    .select('config')
    .eq('provider', SETTINGS_PROVIDER)
    .maybeSingle();
  return normalizeSettings(data?.config);
}

export async function saveSocialSettings(raw: unknown): Promise<ServiceResult<SocialSettings>> {
  const settings = normalizeSettings(raw);
  const { error } = await supabaseAdmin.from('integrations_config').upsert(
    { provider: SETTINGS_PROVIDER, config: settings, updated_at: new Date().toISOString() },
    { onConflict: 'provider' }
  );
  if (error) return { success: false, error: error.message };
  return { success: true, data: settings };
}

// ── Projetos ───────────────────────────────────────────────────

/** Só id e nome: o suficiente para vincular posts e contas a um projeto. */
export async function listProjectOptions(): Promise<ServiceResult<SocialProjectOption[]>> {
  const { data, error } = await supabaseAdmin
    .from('action_plans')
    .select('id, client_name, project_name')
    .order('client_name');

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data || []).map((project) => ({
      id: project.id,
      name: [project.client_name, project.project_name].filter(Boolean).join(' — ') || 'Projeto sem nome',
    })),
  };
}

export async function setAccountProject(id: string, projectId: string | null): Promise<ServiceResult> {
  const { error } = await supabaseAdmin
    .from('social_accounts')
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Insights ───────────────────────────────────────────────────

export interface PublishedTargetRow {
  id: string;
  account_id: string;
  external_id: string;
  permalink: string | null;
  published_at: string | null;
  post: { id: string; caption: string; media: SocialMediaItem[] } | null;
}

/** Destinos publicados de uma conta desde uma data, mais recentes primeiro. */
export async function listPublishedTargets(accountId: string, since: string, limit: number): Promise<PublishedTargetRow[]> {
  const { data } = await supabaseAdmin
    .from('social_post_targets')
    .select('id, account_id, external_id, permalink, published_at, post:social_posts(id, caption, media)')
    .eq('account_id', accountId)
    .eq('status', 'published')
    .not('external_id', 'is', null)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data || []) as unknown as PublishedTargetRow[];
}
