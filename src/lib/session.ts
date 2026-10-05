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
import { fetchProfileById, fetchProfileByEmail } from '@/services/profile-lookup.server';
import { loadWorkspace } from '@/services/workspace.service';
import { applySupportAccess } from '@/services/support-access.service';
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

/** Data de expiração (segundos) lida do próprio JWT já verificado. */
function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch {
    return 0;
  }
}

export interface AuthSession {
  /** Perfil em uso: no modo suporte, já "dentro" da empresa do cliente. */
  profile: UserProfile;
  /** Perfil de verdade (fora do modo suporte é o mesmo de profile). */
  realProfile: UserProfile;
  accessToken: string;
  expiresAt: number;
}

async function sessionFor(profile: UserProfile | null, accessToken: string): Promise<AuthSession | null> {
  if (!profile) return null;
  return { profile: await applySupportAccess(profile), realProfile: profile, accessToken, expiresAt: tokenExpiry(accessToken) };
}

/**
 * Verifica a sessão do cookie contra o Supabase Auth (assinatura real,
 * não pode ser forjada pelo cliente) e devolve perfil + token de acesso.
 * Tenta renovar via refresh_token se o access_token expirou.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    const { data, error } = await supabaseAuth.auth.getUser(accessToken);
    if (!error && data.user) {
      return sessionFor(await resolveProfileFromAuthUser(data.user), accessToken);
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

  return sessionFor(await resolveProfileFromAuthUser(refreshed.user), refreshed.session.access_token);
}

export async function getAuthenticatedProfile(): Promise<UserProfile | null> {
  return (await getAuthSession())?.profile ?? null;
}

type AuthError = { error: { message: string; status: number } };

/** Sessão válida de um usuário ativo, já com a empresa dele resolvida. */
export interface TenantAuth {
  profile: UserProfile;
  /** Empresa da sessão: TODA consulta de servidor filtra por ela. */
  tenantId: string;
  tenantName: string;
  /** Empresa dona da plataforma (Vórtice). */
  isPlatform: boolean;
  modules: string[];
}

/**
 * Helper para rotas que exigem qualquer usuário ativo logado.
 *
 * Devolve também a empresa da sessão (tenantId). Rotas e serviços do
 * servidor usam o service role, que ignora o RLS -- por isso TODA
 * leitura/gravação deve filtrar por esse tenantId. A empresa nunca vem
 * do corpo, da URL ou de cabeçalhos da requisição.
 *
 * `module`: exige que o plano da empresa inclua o módulo (a empresa da
 * plataforma tem todos).
 */
export async function requireActiveProfile(options: { module?: string } = {}): Promise<
  TenantAuth | AuthError
> {
  const profile = await getAuthenticatedProfile();

  if (!profile) {
    return { error: { message: 'Sessão inválida ou expirada. Faça login novamente.', status: 401 } };
  }
  if (profile.status !== 'ACTIVE') {
    return { error: { message: 'Conta desativada. Contate o administrador.', status: 403 } };
  }

  const workspace = await loadWorkspace(profile);
  if (!workspace) {
    return { error: { message: 'Sua conta não está vinculada a uma empresa.', status: 403 } };
  }
  if (!workspace.is_platform && workspace.tenant_status !== 'ACTIVE') {
    return { error: { message: 'O acesso da sua empresa está suspenso. Fale com a Vórtice.', status: 403 } };
  }
  if (options.module && !workspace.modules.includes(options.module)) {
    return { error: { message: 'Este módulo não faz parte do plano da sua empresa.', status: 403 } };
  }

  return {
    profile: { ...profile, workspace },
    tenantId: workspace.tenant_id,
    tenantName: workspace.tenant_name,
    isPlatform: workspace.is_platform,
    modules: workspace.modules,
  };
}

/**
 * Helper para rotas que exigem administrador ativo (da própria empresa).
 */
export async function requireAdminProfile(options: { module?: string } = {}): Promise<TenantAuth | AuthError> {
  const result = await requireActiveProfile(options);
  if ('error' in result) return result;

  if (result.profile.role !== 'ADMIN') {
    return { error: { message: 'Apenas administradores ativos podem realizar esta ação.', status: 403 } };
  }

  return result;
}

/**
 * Helper para rotas que exigem administrador ou gerente ativo.
 */
export async function requireAdminOrManagerProfile(options: { module?: string } = {}): Promise<TenantAuth | AuthError> {
  const result = await requireActiveProfile(options);
  if ('error' in result) return result;

  if (!['ADMIN', 'MANAGER'].includes(result.profile.role)) {
    return { error: { message: 'Usuário sem permissão para esta ação.', status: 403 } };
  }

  return result;
}

/**
 * Painel Master: só administradores da empresa dona da plataforma
 * (criar empresas, planos, identidade visual, avisos).
 */
export async function requirePlatformAdmin(): Promise<TenantAuth | AuthError> {
  const result = await requireAdminProfile();
  if ('error' in result) return result;
  if (!result.isPlatform) {
    return { error: { message: 'Apenas a equipe da Vórtice pode fazer isso.', status: 403 } };
  }
  return result;
}
