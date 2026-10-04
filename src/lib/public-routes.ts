/**
 * Páginas abertas sem login. A política de privacidade precisa ficar
 * aqui: a Meta (app do Facebook/Instagram) e qualquer visitante acessam
 * o link sem conta -- antes ela redirecionava para o login.
 */
export const PUBLIC_ROUTES = ['/login', '/display', '/totem', '/politica-de-privacidade'];

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.includes(pathname);
}
