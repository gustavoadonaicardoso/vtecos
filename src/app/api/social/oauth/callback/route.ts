import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdminProfile } from '@/lib/session';
import { exchangeCodeForLongLivedToken, listPagesWithInstagram } from '@/lib/social/meta-graph';
import { OAUTH_STATE_COOKIE, getOAuthRedirectUri, getPublicOrigin } from '@/lib/social/oauth';
import { saveConnectedPages } from '@/services/social.service';

export const runtime = 'nodejs';

function backToAccounts(request: Request, params: Record<string, string>) {
  const url = new URL('/social', getPublicOrigin(request));
  url.searchParams.set('tab', 'contas');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/api/social/oauth' });
  return response;
}

export async function GET(request: Request) {
  const auth = await requireAdminProfile({ module: 'social', permission: 'social.view' });
  if ('error' in auth) return backToAccounts(request, { oauth_error: auth.error.message });

  const params = new URL(request.url).searchParams;
  if (params.get('error')) {
    return backToAccounts(request, {
      oauth_error: params.get('error_description') || 'A conexão com o Facebook foi cancelada.',
    });
  }

  const code = params.get('code');
  const state = params.get('state');
  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return backToAccounts(request, { oauth_error: 'Sessão de conexão inválida ou expirada. Tente conectar de novo.' });
  }

  try {
    const userToken = await exchangeCodeForLongLivedToken(code, getOAuthRedirectUri(request));
    const pages = await listPagesWithInstagram(userToken);

    if (pages.length === 0) {
      return backToAccounts(request, {
        oauth_error: 'Nenhuma Página do Facebook foi liberada. Conecte de novo e selecione as Páginas (e o Instagram vinculado).',
      });
    }

    const saved = await saveConnectedPages(auth.tenantId, pages, auth.profile.id);
    if (!saved.success) return backToAccounts(request, { oauth_error: saved.error || 'Falha ao salvar as contas.' });

    return backToAccounts(request, { connected: String(saved.data ?? 0) });
  } catch (err) {
    return backToAccounts(request, {
      oauth_error: err instanceof Error ? err.message : 'Falha ao conectar com a Meta.',
    });
  }
}
