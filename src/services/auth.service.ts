/**
 * ============================================================
 * VÓRTICE CRM — Auth Service
 * ============================================================
 * Responsável pelas operações de autenticação e perfil.
 * Centraliza as chamadas ao Supabase Auth e à tabela profiles.
 * ============================================================
 */

import { supabase } from '@/lib/supabase';
import { supabaseAuth } from '@/lib/supabase-auth';
import type { UserProfile, ServiceResult } from '@/types';

// NUNCA importe @/lib/supabase-admin aqui -- este arquivo é importado
// também por código client-side (ex: src/hooks/useUnreadCount.ts). Um
// import de supabaseAdmin aqui quebra a build do navegador inteira: o
// módulo lança um erro assim que é avaliado, no cliente, porque a
// service role key não existe (nem deveria existir) no navegador.

export interface SignInResult {
  profile: UserProfile;
  session: { access_token: string; refresh_token: string; expires_in: number };
}

/**
 * Realiza login via Supabase Auth.
 */
export async function signIn(
  email: string,
  password: string
): Promise<ServiceResult<SignInResult>> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const { data: authData, error: authError } =
      await supabaseAuth.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

    if (authError) {
      console.error('[AuthService] Supabase Auth:', {
        message: authError.message,
        code: authError.code,
        status: authError.status,
      });

      return {
        success: false,
        error: authError.message,
      };
    }

    if (!authData.user || !authData.session) {
      return {
        success: false,
        error: 'Não foi possível identificar o usuário autenticado.',
      };
    }

    // O caminho normal é profiles.id === auth.users.id, mas alguns
    // perfis mais antigos (criados fora do fluxo padrão de criação de
    // usuário) podem ter um id de profile diferente do auth.users
    // correspondente. Sem esse fallback por e-mail, esses usuários
    // simplesmente nunca conseguiriam logar.
    const profile =
      (await fetchProfileById(authData.user.id)) ||
      (authData.user.email ? await fetchProfileByEmail(authData.user.email) : null);

    if (!profile) {
      return {
        success: false,
        error:
          'O login foi realizado, mas não existe um perfil correspondente na tabela profiles.',
      };
    }

    if (profile.status === 'INACTIVE') {
      return {
        success: false,
        error: 'Conta desativada. Contate o administrador.',
      };
    }

    return {
      success: true,
      data: {
        profile,
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
        },
      },
    };
  } catch (err: unknown) {
    console.error('[AuthService] signIn:', err);

    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Falha na autenticação. Tente novamente.',
    };
  }
}

/**
 * Busca o perfil completo de um usuário pelo ID.
 */
export async function fetchProfileById(
  userId: string
): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[AuthService] fetchProfileById:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    return data as UserProfile;
  } catch (err: unknown) {
    console.error('[AuthService] fetchProfileById:', err);
    return null;
  }
}

/**
 * Busca o perfil completo de um usuário pelo e-mail -- fallback usado
 * no login quando profiles.id não bate com o auth.users.id (ver
 * comentário em signIn).
 */
export async function fetchProfileByEmail(
  email: string
): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('[AuthService] fetchProfileByEmail:', error);
      return null;
    }

    return (data as UserProfile) ?? null;
  } catch (err: unknown) {
    console.error('[AuthService] fetchProfileByEmail:', err);
    return null;
  }
}

/**
 * Envia e-mail de recuperação de senha via Supabase Auth.
 */
export async function sendPasswordResetEmail(
  email: string,
  redirectTo: string
): Promise<ServiceResult> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo,
      }
    );

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
    };
  } catch (err: unknown) {
    console.error('[AuthService] sendPasswordResetEmail:', err);

    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar o e-mail de recuperação.',
    };
  }
}

/**
 * Busca a contagem de mensagens internas não lidas para um usuário.
 */
export async function fetchUnreadInternalChats(
  userId: string
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('internal_chat')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq('receiver_id', userId)
      .eq('is_read', false);

    if (error) {
      console.error('[AuthService] fetchUnreadInternalChats:', error);
      return 0;
    }

    return count ?? 0;
  } catch (err: unknown) {
    console.error('[AuthService] fetchUnreadInternalChats:', err);
    return 0;
  }
}