export const OAUTH_STATE_COOKIE = 'vortice_meta_oauth_state';

/**
 * Origem pública do app. Atrás do Nginx, request.url pode vir como
 * http://localhost:3000 -- por isso olha os cabeçalhos repassados pelo
 * proxy. A URI de callback precisa bater EXATAMENTE com a cadastrada no
 * app da Meta, então META_OAUTH_REDIRECT_URI permite fixá-la.
 */
export function getPublicOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export function getOAuthRedirectUri(request: Request) {
  return process.env.META_OAUTH_REDIRECT_URI || `${getPublicOrigin(request)}/api/social/oauth/callback`;
}
