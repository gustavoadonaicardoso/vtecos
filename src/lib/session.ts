/**
 * ============================================================
 * VÓRTICE CRM — Sessão de servidor
 * ============================================================
 * Antes desta correção, toda rota "protegida" confiava cegamente
 * no header `x-user-id` enviado pelo próprio navegador -- qualquer
 * pessoa podia forjar esse header e se passar por outro usuário
 * (inclusive um admin) sem saber a senha de ninguém.
 *
 * Agora o login grava, em cookies httpOnly, a sessão real emitida
 * pelo Supabase Auth (access_token + refresh_token). Toda rota
 * privilegiada deve chamar getAuthenticatedProfile() para descobrir
 * quem está fazendo a requisição -- nunca confiar em id/role vindos
 * do corpo ou de headers da própria requisição.
 * ============================================================
 */

import { cookies } from 'next/headers';
import { supabaseAuth } from '@/lib/supabase-auth';
import { fetchProfileById, fetchProfileByEmail } from '@/services/auth.service';
import type { UserProfile } from '@/types';

const ACCESS_COOKIE = 'vortice_at';
const REFRESH_COOKIE = 'vortice_rt';

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function setSessionCookies(accessToken: string, refreshToken: string, expiresIn: number) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, { ...baseCookieOptions, maxAge: expiresIn });
  // Refresh token vive mais tempo -- é o que permite manter o usuário
  // logado sem forçar login de novo a cada expiração do access token.
  store.set(REFRESH_COOKIE, refreshToken, { ...baseCookieOptions, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

async function resolveProfileFromAuthUser(authUser: { id: string; email?: string | null }): Promise<UserProfile | null> {
  return (
    (await fetchProfileById(authUser.id)) ||
    (authUser.email ? await fetchProfileByEmail(authUser.email) : null)
  );
}

/**
 * Verifica a sessão do cookie contra o Supabase Auth (assinatura real,
 * não pode ser forjada pelo cliente) e devolve o perfil correspondente.
 * Tenta renovar via refresh_token se o access_token expirou.
 */
export async function getAuthenticatedProfile(): Promise<UserProfile | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    const { data, error } = await supabaseAuth.auth.getUser(accessToken);
    if (!error && data.user) {
      return resolveProfileFromAuthUser(data.user);
    }
  }

  if (!refreshToken) return null;

  const { data: refreshed, error: refreshError } = await supabaseAuth.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (refreshError || !refreshed.session || !refreshed.user) {
    return null;
  }

  await setSessionCookies(
    refreshed.session.access_token,
    refreshed.session.refresh_token,
    refreshed.session.expires_in
  );

  return resolveProfileFromAuthUser(refreshed.user);
}

/**
 * Helper para rotas que exigem qualquer usuário ativo logado.
 *
 * Logins de cliente (account_type CLIENT) são barrados por padrão: as
 * rotas da equipe trabalham com dados da Vórtice que não são separados
 * por empresa. Só as rotas preparadas para isso (módulos por empresa,
 * notificações e o próprio perfil) passam `{ allowClient: true }` e
 * filtram pelo tenant_id da sessão.
 */
export async function requireActiveProfile(options: { allowClient?: boolean } = {}): Promise<
  { profile: UserProfile } | { error: { message: string; status: number } }
> {
  const profile = await getAuthenticatedProfile();

  if (!profile) {
    return { error: { message: 'Sessão inválida ou expirada. Faça login novamente.', status: 401 } };
  }
  if (profile.status !== 'ACTIVE') {
    return { error: { message: 'Conta desativada. Contate o administrador.', status: 403 } };
  }
  if (profile.account_type === 'CLIENT' && !options.allowClient) {
    return { error: { message: 'Este recurso não está disponível para a sua conta.', status: 403 } };
  }

  return { profile };
}

/**
 * Helper para rotas que exigem administrador ativo.
 */
export async function requireAdminProfile(): Promise<
  { profile: UserProfile } | { error: { message: string; status: number } }
> {
  const result = await requireActiveProfile();
  if ('error' in result) return result;

  if (result.profile.role !== 'ADMIN') {
    return { error: { message: 'Apenas administradores ativos podem realizar esta ação.', status: 403 } };
  }

  return result;
}

/**
 * Helper para rotas que exigem administrador ou gerente ativo.
 */
export async function requireAdminOrManagerProfile(): Promise<
  { profile: UserProfile } | { error: { message: string; status: number } }
> {
  const result = await requireActiveProfile();
  if ('error' in result) return result;

  if (!['ADMIN', 'MANAGER'].includes(result.profile.role)) {
    return { error: { message: 'Usuário sem permissão para listar estes perfis.', status: 403 } };
  }

  return result;
}
