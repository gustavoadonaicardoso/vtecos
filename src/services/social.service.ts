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

export async function listAccounts(tenantId: string): Promise<ServiceResult<SocialAccount[]>> {
  const query = (columns: string) => supabaseAdmin
    .from('social_accounts')
    .select(columns)
    .eq('tenant_id', tenantId)
    .neq('status', 'disconnected')
    .order('platform')
    .order('name');

  let { data, error } = await query(`${ACCOUNT_PUBLIC_COLUMNS}, messaging_status, messaging_error`);
  // Banco sem a migration 202610270001_social_inbox.sql: lista sem o status das mensagens.
  if (error && /messaging_/.test(error.message)) ({ data, error } = await query(ACCOUNT_PUBLIC_COLUMNS));

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as unknown as SocialAccount[] };
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
export async function getAccountsWithTokens(tenantId: string, ids: string[]): Promise<AccountWithToken[]> {
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('social_accounts')
    .select('id, platform, external_id, page_id, name, status, access_token')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return (data || []) as AccountWithToken[];
}

export async function saveConnectedPages(tenantId: string, pages: MetaPageWithInstagram[], connectedBy: string) {
  const now = new Date().toISOString();
  const rows = pages.flatMap((page) => {
    const facebook = {
      tenant_id: tenantId,
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
      tenant_id: tenantId,
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

  // tenant-scope: ok (cada linha de rows leva tenant_id; a conta passa a ser desta empresa)
  const { error } = await supabaseAdmin
    .from('social_accounts')
    .upsert(rows, { onConflict: 'platform,external_id' });

  if (error) return { success: false, error: error.message } as ServiceResult<number>;
  return { success: true, data: rows.length } as ServiceResult<number>;
}

export async function disconnectAccount(tenantId: string, id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin
    .from('social_accounts')
    .update({ status: 'disconnected', access_token: '', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function markAccountError(tenantId: string, id: string, message: string) {
  await supabaseAdmin
    .from('social_accounts')
    .update({ status: 'error', last_error: message, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
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

export async function listPosts(tenantId: string, filters: PostFilters = {}): Promise<ServiceResult<SocialPost[]>> {
  let query = supabaseAdmin
    .from('social_posts')
    .select(POST_WITH_TARGETS)
    .eq('tenant_id', tenantId)
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

export async function getPost(tenantId: string, id: string): Promise<SocialPost | null> {
  const { data } = await supabaseAdmin.from('social_posts').select(POST_WITH_TARGETS).eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  return (data as SocialPost) || null;
}

async function projectBelongs(tenantId: string, projectId: string) {
  const { data } = await supabaseAdmin.from('action_plans').select('id').eq('tenant_id', tenantId).eq('id', projectId).maybeSingle();
  return Boolean(data);
}

/** Projeto e contas de destino precisam ser da mesma empresa do post. */
async function validateRefs(tenantId: string, input: { projectId: string | null; accountIds: string[] }) {
  if (input.projectId && !(await projectBelongs(tenantId, input.projectId))) return 'Projeto não encontrado.';
  const ids = Array.from(new Set(input.accountIds));
  if (ids.length > 0) {
    const { data } = await supabaseAdmin.from('social_accounts').select('id').eq('tenant_id', tenantId).in('id', ids);
    if ((data || []).length !== ids.length) return 'Conta de destino não encontrada.';
  }
  return null;
}

/** Agendador: empresa dona de um post (para publicar com as contas certas). */
export async function getPostTenant(id: string): Promise<string | null> {
  // tenant-scope: ok (descobre a empresa do post para o agendador)
  const { data } = await supabaseAdmin.from('social_posts').select('tenant_id').eq('id', id).maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}

export interface PostInput {
  caption: string;
  media: SocialMediaItem[];
  scheduledAt: string | null;
  projectId: string | null;
  accountIds: string[];
}

export async function createPost(tenantId: string, input: PostInput, createdBy: string): Promise<ServiceResult<SocialPost>> {
  const projectError = await validateRefs(tenantId, input);
  if (projectError) return { success: false, error: projectError };

  const { data: post, error } = await supabaseAdmin
    .from('social_posts')
    .insert([{
      tenant_id: tenantId,
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

  const targetsResult = await replaceTargets(tenantId, post.id, input.accountIds);
  if (!targetsResult.success) return { success: false, error: targetsResult.error };

  const created = await getPost(tenantId, post.id);
  return created ? { success: true, data: created } : { success: false, error: 'Post criado, mas não foi possível relê-lo.' };
}

/** Troca os destinos ainda não publicados; destinos já publicados nunca são apagados. */
async function replaceTargets(tenantId: string, postId: string, accountIds: string[]): Promise<ServiceResult> {
  const { data: existing } = await supabaseAdmin
    .from('social_post_targets')
    .select('id, account_id, status')
    .eq('tenant_id', tenantId)
    .eq('post_id', postId);

  const published = new Set((existing || []).filter((t) => t.status === 'published').map((t) => t.account_id));
  const removable = (existing || []).filter((t) => t.status !== 'published').map((t) => t.id);

  if (removable.length > 0) {
    const { error } = await supabaseAdmin.from('social_post_targets').delete().eq('tenant_id', tenantId).in('id', removable);
    if (error) return { success: false, error: error.message };
  }

  const toInsert = [...new Set(accountIds)]
    .filter((accountId) => !published.has(accountId))
    .map((accountId) => ({ tenant_id: tenantId, post_id: postId, account_id: accountId, status: 'pending' }));

  if (toInsert.length > 0) {
    // tenant-scope: ok (cada linha de toInsert leva tenant_id)
    const { error } = await supabaseAdmin.from('social_post_targets').insert(toInsert);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

export async function updatePost(tenantId: string, id: string, input: PostInput): Promise<ServiceResult<SocialPost>> {
  const refError = await validateRefs(tenantId, input);
  if (refError) return { success: false, error: refError };

  const { error } = await supabaseAdmin
    .from('social_posts')
    .update({
      caption: input.caption,
      media: input.media,
      scheduled_at: input.scheduledAt,
      project_id: input.projectId,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  const targetsResult = await replaceTargets(tenantId, id, input.accountIds);
  if (!targetsResult.success) return { success: false, error: targetsResult.error };

  const updated = await getPost(tenantId, id);
  return updated ? { success: true, data: updated } : { success: false, error: 'Post não encontrado.' };
}

export async function deletePost(tenantId: string, id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from('social_posts').delete().eq('tenant_id', tenantId).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function setPostStatus(
  tenantId: string,
  id: string,
  status: SocialPostStatus,
  extra: Record<string, unknown> = {}
): Promise<ServiceResult> {
  const { error } = await supabaseAdmin
    .from('social_posts')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('tenant_id', tenantId)
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
  tenantId: string,
  id: string,
  fromStatuses: SocialPostStatus[],
  to: SocialPostStatus,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('social_posts')
    .update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq('tenant_id', tenantId)
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
  tenantId: string,
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
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .in('status', fromStatuses)
    .select('id, scheduled_at, created_by')
    .maybeSingle();
  return data || null;
}

/** Agendador: posts vencidos de TODAS as empresas (cada um é publicado na conta da sua empresa). */
export async function listDuePostIds(limit: number): Promise<string[]> {
  // tenant-scope: ok (varredura do agendador; a empresa é lida do próprio post)
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
  // tenant-scope: ok (varredura do agendador; a empresa é lida do próprio post)
  const { data } = await supabaseAdmin
    .from('social_posts')
    .select('id')
    .eq('status', 'publishing')
    .lt('publishing_started_at', threshold);
  return (data || []).map((row) => row.id);
}

export async function updateTarget(
  tenantId: string,
  id: string,
  update: { status: 'published' | 'failed'; external_id?: string | null; permalink?: string | null; error?: string | null }
) {
  await supabaseAdmin
    .from('social_post_targets')
    .update({
      ...update,
      published_at: update.status === 'published' ? new Date().toISOString() : null,
    })
    .eq('tenant_id', tenantId)
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
/** Avisa os admins e gerentes ativos DA EMPRESA do post. */
export async function notifyApprovers(tenantId: string, title: string, content: string, link: string, exceptUserId?: string) {
  const { data: approvers, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
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

export async function getSocialSettings(tenantId: string): Promise<SocialSettings> {
  const { data } = await supabaseAdmin
    .from('integrations_config')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider', SETTINGS_PROVIDER)
    .maybeSingle();
  return normalizeSettings(data?.config);
}

export async function saveSocialSettings(tenantId: string, raw: unknown): Promise<ServiceResult<SocialSettings>> {
  const settings = normalizeSettings(raw);
  const { error } = await supabaseAdmin.from('integrations_config').upsert(
    { tenant_id: tenantId, provider: SETTINGS_PROVIDER, config: settings, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,provider' }
  );
  if (error) return { success: false, error: error.message };
  return { success: true, data: settings };
}

// ── Projetos ───────────────────────────────────────────────────

/** Só id e nome: o suficiente para vincular posts e contas a um projeto. */
export async function listProjectOptions(tenantId: string): Promise<ServiceResult<SocialProjectOption[]>> {
  const { data, error } = await supabaseAdmin
    .from('action_plans')
    .select('id, client_name, project_name')
    .eq('tenant_id', tenantId)
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

export async function setAccountProject(tenantId: string, id: string, projectId: string | null): Promise<ServiceResult> {
  if (projectId && !(await projectBelongs(tenantId, projectId))) return { success: false, error: 'Projeto não encontrado.' };
  const { error } = await supabaseAdmin
    .from('social_accounts')
    .update({ project_id: projectId, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
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
export async function listPublishedTargets(tenantId: string, accountId: string, since: string, limit: number): Promise<PublishedTargetRow[]> {
  const { data } = await supabaseAdmin
    .from('social_post_targets')
    .select('id, account_id, external_id, permalink, published_at, post:social_posts(id, caption, media)')
    .eq('tenant_id', tenantId)
    .eq('account_id', accountId)
    .eq('status', 'published')
    .not('external_id', 'is', null)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data || []) as unknown as PublishedTargetRow[];
}
