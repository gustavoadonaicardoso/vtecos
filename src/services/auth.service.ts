/**
 * ============================================================
 * VÓRTICE CRM — Auth Service
 * ============================================================
 * Responsável pelas operações de autenticação e perfil.
 * Centraliza as chamadas ao Supabase Auth e à tabela profiles.
 * ============================================================
 */

import { supabase } from '@/lib/supabase';
import { UserProfile, ServiceResult } from '@/types';

/**
 * Realiza login via Supabase Auth (JWT).
 * Tenta auth nativo primeiro; cai no legado (password em texto) como fallback
 * enquanto a migração de usuários não for concluída.
 */
export async function signIn(
  email: string,
  password: string
): Promise<ServiceResult<UserProfile>> {
  try {
    // 1. Tentar Supabase Auth nativo
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!authError && authData.user) {
      // Buscar perfil completo
      const profile = await fetchProfileById(authData.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        return { success: false, error: 'Perfil não encontrado ou conta desativada.' };
      }
      if (profile.status === 'INACTIVE') {
        await supabase.auth.signOut();
        return { success: false, error: 'Conta desativada. Contate o administrador.' };
      }
      return { success: true, data: profile };
    }

    // 2. Fallback legado: password em texto plano (migração pendente)
    const { data: legacyData, error: legacyError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .eq('status', 'ACTIVE')
      .single();

    if (legacyError || !legacyData) {
      return { success: false, error: 'E-mail ou senha incorretos, ou conta desativada.' };
    }

    return { success: true, data: legacyData as UserProfile };
  } catch (err: any) {
    console.error('[AuthService] signIn:', err);
    return { success: false, error: 'Falha na autenticação. Tente novamente.' };
  }
}

/**
 * Encerra a sessão no Supabase Auth.
 */
export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[AuthService] signOut:', err);
  }
}

/**
 * Busca o perfil completo de um usuário pelo ID.
 */
export async function fetchProfileById(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data as UserProfile;
  } catch (err) {
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[AuthService] sendPasswordResetEmail:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Busca a contagem de mensagens internas não lidas para um usuário.
 */
export async function fetchUnreadInternalChats(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('internal_chat')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false);

    if (error) return 0;
    return count || 0;
  } catch (err) {
    console.error('[AuthService] fetchUnreadInternalChats:', err);
    return 0;
  }
}
