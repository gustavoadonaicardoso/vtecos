/**
 * ============================================================
 * VÓRTICE CRM — Users / Profiles Service (server-only)
 * ============================================================
 * Operações administrativas sobre profiles/auth.users que exigem a
 * service role (criação de usuário, listagem completa da equipe).
 * Só deve ser importado por rotas de API — nunca por componentes
 * client-side (ao contrário de src/services/auth.service.ts, que é
 * seguro no navegador por usar a anon key).
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

export interface RequesterAccess {
  role: string;
  status: string;
}

/** Busca role/status de quem fez a requisição, para checagem de permissão na rota. */
export async function fetchRequesterAccess(requesterId: string): Promise<RequesterAccess | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('role, status')
    .eq('id', requesterId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

/**
 * Lista perfis pelo servidor para não depender do RLS do cliente anon.
 * `scope=chat` retorna somente os campos necessários para o chat;
 * `scope=team` é reservado para administradores e gerentes.
 */
export async function fetchProfiles(scope: 'chat' | 'team'): Promise<ServiceResult> {
  let query = supabaseAdmin
    .from('profiles')
    .select(
      scope === 'chat'
        ? 'id, name, email, role, status, avatar_url'
        : 'id, name, email, role, status, permissions, allowed_templates, phone, avatar_url, created_at'
    )
    .order('name');

  if (scope === 'chat') {
    query = query.eq('status', 'ACTIVE');
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}

/**
 * Cria o usuário no Supabase Auth e o respectivo perfil na mesma operação.
 * Se a gravação do perfil falhar, desfaz a criação da credencial para não
 * deixar um usuário de Auth órfão sem perfil.
 */
export type CreateUserResult =
  | { success: true; data: any }
  | { success: false; error: string; status: number };

export async function createUserWithProfile(params: {
  name: string;
  email: string;
  password: string;
  role: string;
  permissions: Record<string, unknown>;
}): Promise<CreateUserResult> {
  const { name, email, password, role, permissions } = params;

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (authError || !authData.user) {
    const isDuplicate =
      authError?.message.toLowerCase().includes('already') ||
      authError?.message.toLowerCase().includes('exist');

    return {
      success: false,
      status: isDuplicate ? 409 : 400,
      error: isDuplicate
        ? 'Este e-mail já está cadastrado.'
        : authError?.message || 'Não foi possível criar a credencial de acesso.',
    };
  }

  // A partir daqui, qualquer falha (esperada ou não) desfaz a credencial
  // recém-criada para não deixar um usuário de Auth órfão sem perfil.
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        name,
        email,
        role,
        status: 'ACTIVE',
        permissions,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (profileError || !profile) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return { success: false, status: 400, error: profileError?.message || 'Não foi possível criar o perfil do usuário.' };
    }

    return { success: true, data: profile };
  } catch (err: unknown) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw err;
  }
}

export async function updateOwnProfile(
  userId: string,
  updates: { name: string; phone?: string | null; avatar_url?: string | null }
): Promise<ServiceResult> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      name: updates.name,
      phone: updates.phone || null,
      avatar_url: updates.avatar_url || null,
    })
    .eq('id', userId)
    .select()
    .single();

  if (error || !data) return { success: false, error: error?.message || 'Falha ao atualizar perfil.' };
  return { success: true, data };
}

export async function findProfileByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email')
    .eq('email', email)
    .single();

  if (error || !data) return null;
  return data;
}

/** Notifica todos os admins ativos que um usuário pediu redefinição de senha. */
export async function notifyAdminsOfPasswordResetRequest(userProfile: { id: string; name: string; email: string }) {
  const { data: admins, error: adminsError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE');

  if (adminsError || !admins || admins.length === 0) {
    console.warn('Nenhum administrador ativo encontrado no sistema para receber a demanda.');
    return;
  }

  const notifications = admins.map((admin) => ({
    user_id: admin.id,
    type: 'task',
    title: 'Solicitação de Senha',
    content: `O usuário ${userProfile.name} (${userProfile.email}) solicitou a redefinição de sua senha.`,
    is_read: false,
    link: '/users',
  }));

  const { error: notifError } = await supabaseAdmin.from('system_notifications').insert(notifications);
  if (notifError) {
    console.error('Erro ao criar notificações para os admins:', notifError.message);
  }
}
