import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdminProfile } from '@/lib/session';
import { buildOAuthDialogUrl, isMetaAppConfigured } from '@/lib/social/meta-graph';
import { OAUTH_STATE_COOKIE, getOAuthRedirectUri, getPublicOrigin } from '@/lib/social/oauth';

export const runtime = 'nodejs';

function backToAccounts(request: Request, error: string) {
  const url = new URL('/social', getPublicOrigin(request));
  url.searchParams.set('tab', 'contas');
  url.searchParams.set('oauth_error', error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const auth = await requireAdminProfile({ module: 'social' });
  if ('error' in auth) return backToAccounts(request, auth.error.message);

  if (!isMetaAppConfigured()) {
    return backToAccounts(request, 'O app da Meta ainda não foi configurado no servidor (META_APP_ID/META_APP_SECRET).');
  }

  // "state" aleatório num cookie httpOnly: o callback só aceita a volta
  // da Meta se trouxer o mesmo valor (proteção contra CSRF no login).
  const state = randomUUID();
  const response = NextResponse.redirect(buildOAuthDialogUrl(state, getOAuthRedirectUri(request)));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/social/oauth',
    maxAge: 600,
  });
  return response;
}
