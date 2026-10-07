/**
 * ============================================================
 * VÓRTICE CRM — Cliente da Graph API da Meta (Instagram/Facebook)
 * ============================================================
 * Server-only: usa META_APP_SECRET e tokens de Página. Nunca importe
 * isto de código que roda no navegador.
 * O app (ID e segredo) vem do Painel Master > Plataforma.
 * ============================================================
 */

import { platformSettings } from '@/lib/platform-settings';
import { META_GRAPH_URL, META_GRAPH_VERSION } from '@/lib/meta-graph-version';

const GRAPH_VERSION = META_GRAPH_VERSION;
const GRAPH_URL = META_GRAPH_URL;

export const META_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'read_insights',
  'business_management',
];

export class MetaGraphError extends Error {
  code?: number;
  /** Token inválido/revogado: a conta precisa ser reconectada. */
  tokenInvalid: boolean;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'MetaGraphError';
    this.code = code;
    this.tokenInvalid = code === 190;
  }
}

interface GraphErrorBody {
  message?: string;
  code?: number;
  error_user_msg?: string;
}

function humanizeGraphError(error: GraphErrorBody): string {
  const detail = error.error_user_msg || error.message || 'erro desconhecido';
  switch (error.code) {
    case 190:
      return `A conexão com a Meta expirou ou foi revogada. Reconecte a conta em Redes Sociais → Contas. (${detail})`;
    case 10:
    case 200:
      return `A Meta negou a permissão para esta ação. Reconecte a conta aceitando todas as permissões. (${detail})`;
    case 4:
    case 17:
    case 32:
    case 613:
      return `Limite de requisições da Meta atingido. Tente de novo mais tarde. (${detail})`;
    default:
      return detail;
  }
}

type Params = Record<string, string>;

export async function graphRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: Params = {},
  accessToken?: string
): Promise<T> {
  const query = new URLSearchParams(method === 'GET' || method === 'DELETE' ? params : {});
  if (accessToken) query.set('access_token', accessToken);

  const url = `${GRAPH_URL}${path}${query.toString() ? `?${query}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: method === 'POST' ? new URLSearchParams(params).toString() : undefined,
    cache: 'no-store',
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    const error: GraphErrorBody = body?.error || { message: `HTTP ${response.status}` };
    throw new MetaGraphError(humanizeGraphError(error), error.code);
  }
  return body as T;
}

async function requireAppCredentials() {
  const { metaAppId: appId, metaAppSecret: appSecret } = await platformSettings();
  if (!appId || !appSecret) {
    throw new MetaGraphError('O app da Meta da Vórtice não está configurado (Painel Master > Plataforma).');
  }
  return { appId, appSecret };
}

// ── OAuth ──────────────────────────────────────────────────────

export async function isMetaAppConfigured() {
  const settings = await platformSettings();
  return Boolean(settings.metaAppId && settings.metaAppSecret);
}

export async function buildOAuthDialogUrl(state: string, redirectUri: string) {
  const { appId } = await requireAppCredentials();
  const { metaLoginConfigId } = await platformSettings();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  });
  // Facebook Login for Business usa uma "configuração" criada no painel do
  // app em vez de uma lista de escopos; sem ela, cai no login clássico.
  if (metaLoginConfigId) {
    params.set('config_id', metaLoginConfigId);
  } else {
    params.set('scope', META_OAUTH_SCOPES.join(','));
  }
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
}

export async function exchangeCodeForLongLivedToken(code: string, redirectUri: string): Promise<string> {
  const { appId, appSecret } = await requireAppCredentials();

  const shortLived = await graphRequest<{ access_token: string }>('GET', '/oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const longLived = await graphRequest<{ access_token: string }>('GET', '/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLived.access_token,
  });

  return longLived.access_token;
}

export interface MetaPageWithInstagram {
  pageId: string;
  pageName: string;
  /** Token da Página derivado do token longo do usuário: não expira. */
  pageToken: string;
  pageAvatar: string | null;
  instagram: { id: string; username: string; name: string | null; avatar: string | null } | null;
}

export async function listPagesWithInstagram(userToken: string): Promise<MetaPageWithInstagram[]> {
  const result = await graphRequest<{
    data: Array<{
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
      instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
    }>;
  }>(
    'GET',
    '/me/accounts',
    {
      fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
      limit: '100',
    },
    userToken
  );

  return (result.data || []).map((page) => ({
    pageId: page.id,
    pageName: page.name,
    pageToken: page.access_token,
    pageAvatar: page.picture?.data?.url ?? null,
    instagram: page.instagram_business_account
      ? {
          id: page.instagram_business_account.id,
          username: page.instagram_business_account.username || '',
          name: page.instagram_business_account.name ?? null,
          avatar: page.instagram_business_account.profile_picture_url ?? null,
        }
      : null,
  }));
}

// ── Publicação ─────────────────────────────────────────────────

export interface PublishResult {
  externalId: string;
  permalink: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** O Instagram processa o container de forma assíncrona; só dá pra publicar quando estiver FINISHED. */
async function waitForInstagramContainer(containerId: string, token: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { status_code } = await graphRequest<{ status_code?: string }>(
      'GET',
      `/${containerId}`,
      { fields: 'status_code' },
      token
    );
    if (status_code === 'FINISHED' || status_code === 'PUBLISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      throw new MetaGraphError(
        'O Instagram não conseguiu processar a imagem. Confira o formato (JPEG) e a proporção (entre 4:5 e 1.91:1).'
      );
    }
    await sleep(2000);
  }
  throw new MetaGraphError('O Instagram demorou demais para processar a imagem. Tente de novo.');
}

export async function publishToInstagram(params: {
  igUserId: string;
  token: string;
  caption: string;
  imageUrls: string[];
}): Promise<PublishResult> {
  const { igUserId, token, caption, imageUrls } = params;
  if (imageUrls.length === 0) {
    throw new MetaGraphError('O Instagram exige pelo menos uma imagem no post.');
  }
  if (imageUrls.length > 10) {
    throw new MetaGraphError('O Instagram aceita no máximo 10 imagens por carrossel.');
  }

  let creationId: string;
  if (imageUrls.length === 1) {
    const container = await graphRequest<{ id: string }>(
      'POST',
      `/${igUserId}/media`,
      { image_url: imageUrls[0], caption },
      token
    );
    creationId = container.id;
  } else {
    const children: string[] = [];
    for (const imageUrl of imageUrls) {
      const child = await graphRequest<{ id: string }>(
        'POST',
        `/${igUserId}/media`,
        { image_url: imageUrl, is_carousel_item: 'true' },
        token
      );
      await waitForInstagramContainer(child.id, token);
      children.push(child.id);
    }
    const carousel = await graphRequest<{ id: string }>(
      'POST',
      `/${igUserId}/media`,
      { media_type: 'CAROUSEL', children: children.join(','), caption },
      token
    );
    creationId = carousel.id;
  }

  await waitForInstagramContainer(creationId, token);
  const published = await graphRequest<{ id: string }>(
    'POST',
    `/${igUserId}/media_publish`,
    { creation_id: creationId },
    token
  );

  const media = await graphRequest<{ permalink?: string }>(
    'GET',
    `/${published.id}`,
    { fields: 'permalink' },
    token
  ).catch(() => ({ permalink: undefined }));

  return { externalId: published.id, permalink: media.permalink ?? null };
}

export async function publishToFacebook(params: {
  pageId: string;
  token: string;
  caption: string;
  imageUrls: string[];
}): Promise<PublishResult> {
  const { pageId, token, caption, imageUrls } = params;
  let postId: string;

  if (imageUrls.length === 0) {
    if (!caption.trim()) throw new MetaGraphError('Post sem imagem precisa de texto.');
    const post = await graphRequest<{ id: string }>('POST', `/${pageId}/feed`, { message: caption }, token);
    postId = post.id;
  } else if (imageUrls.length === 1) {
    const photo = await graphRequest<{ id: string; post_id?: string }>(
      'POST',
      `/${pageId}/photos`,
      { url: imageUrls[0], caption },
      token
    );
    postId = photo.post_id || photo.id;
  } else {
    // Várias fotos: sobe cada uma sem publicar e anexa todas num único post.
    const attached: Params = { message: caption };
    for (let index = 0; index < imageUrls.length; index += 1) {
      const photo = await graphRequest<{ id: string }>(
        'POST',
        `/${pageId}/photos`,
        { url: imageUrls[index], published: 'false' },
        token
      );
      attached[`attached_media[${index}]`] = JSON.stringify({ media_fbid: photo.id });
    }
    const post = await graphRequest<{ id: string }>('POST', `/${pageId}/feed`, attached, token);
    postId = post.id;
  }

  const details = await graphRequest<{ permalink_url?: string }>(
    'GET',
    `/${postId}`,
    { fields: 'permalink_url' },
    token
  ).catch(() => ({ permalink_url: undefined }));

  return { externalId: postId, permalink: details.permalink_url ?? null };
}
