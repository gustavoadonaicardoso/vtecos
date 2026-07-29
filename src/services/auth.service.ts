/**
 * ============================================================
 * VÓRTICE CRM — Auth Service
 * ============================================================
 * Responsável pelas operações de autenticação e perfil.
 * Centraliza as chamadas ao Supabase Auth e à tabela profiles.
 * ============================================================
 */

import { supabase } from '@/lib/supabase';
import type { UserProfile, ServiceResult } from '@/types';

/**
 * Realiza login via Supabase Auth.
 */
export async function signIn(
  email: string,
  password: string
): Promise<ServiceResult<UserProfile>> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
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

    if (!authData.user) {
      return {
        success: false,
        error: 'Não foi possível identificar o usuário autenticado.',
      };
    }

    const profile = await fetchProfileById(authData.user.id);

    if (!profile) {
      await supabase.auth.signOut();

      return {
        success: false,
        error:
          'O login foi realizado, mas não existe um perfil correspondente na tabela profiles.',
      };
    }

    if (profile.status === 'INACTIVE') {
      await supabase.auth.signOut();

      return {
        success: false,
        error: 'Conta desativada. Contate o administrador.',
      };
    }

    return {
      success: true,
      data: profile,
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
 * Encerra a sessão no Supabase Auth.
 */
export async function signOut(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('[AuthService] signOut:', error);
    }
  } catch (err: unknown) {
    console.error('[AuthService] signOut:', err);
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
 * Envia e-mail de recuperação de senha via Supabase Auth.
 */
export async function sendPasswordResetEmail(
  email: string,
  redirectTo: string
): Promise<ServiceResult> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.resetPasswordForEmail(
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