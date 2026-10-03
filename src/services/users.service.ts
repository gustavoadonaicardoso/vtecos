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

/**
 * Lista perfis pelo servidor para não depender do RLS do cliente anon.
 * `scope=chat` retorna somente os campos necessários para o chat;
 * `scope=team` é reservado para administradores e gerentes.
 */
export async function fetchProfiles(scope: 'chat' | 'team'): Promise<ServiceResult<any[]>> {
  const baseColumns = scope === 'chat'
    ? 'id, name, email, role, status, avatar_url'
    : 'id, name, email, role, status, permissions, allowed_templates, phone, avatar_url, created_at';

  const run = (columns: string) => {
    // Logins de clientes (account_type CLIENT) são geridos no painel Master,
    // por empresa -- não aparecem na equipe nem no chat interno.
    let query = supabaseAdmin.from('profiles').select(columns).neq('account_type', 'CLIENT').order('name');
    if (scope === 'chat') query = query.eq('status', 'ACTIVE');
    return query;
  };

  // last_seen_at alimenta o "Visto há X min"; se a migration ainda não rodou,
  // a coluna não existe e a lista sai sem ela em vez de quebrar.
  let { data, error } = await run(`${baseColumns}, last_seen_at`);
  if (error) ({ data, error } = await run(baseColumns));

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
  /** Login de cliente: preso à empresa informada. */
  clientTenantId?: string;
}): Promise<CreateUserResult> {
  const { name, email, password, role, permissions, clientTenantId } = params;

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
        ...(clientTenantId ? { account_type: 'CLIENT', tenant_id: clientTenantId } : {}),
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

/** Verifica se `userId` é o único admin ATIVO restante no sistema. */
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('role, status, account_type')
    .eq('id', userId)
    .maybeSingle();

  // Admin de uma empresa cliente não conta como admin da Vórtice.
  if (!target || target.role !== 'ADMIN' || target.status !== 'ACTIVE' || target.account_type === 'CLIENT') return false;

  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE')
    .neq('account_type', 'CLIENT');

  return (count ?? 0) <= 1;
}

/**
 * Atualiza os campos administráveis de um membro da equipe (nome, e-mail,
 * cargo, status, permissões e templates liberados). Não mexe em senha —
 * isso é responsabilidade de adminResetPassword, abaixo.
 */
export async function updateTeamMember(
  userId: string,
  updates: {
    name: string;
    email: string;
    role: string;
    status: string;
    permissions: Record<string, unknown>;
    allowed_templates: string[];
  }
): Promise<ServiceResult<any>> {
  // Se a mudança tira o cargo ADMIN ou desativa o usuário, garante que
  // não é o último admin ativo -- senão ninguém mais consegue entrar em
  // Usuários/Admin/Master pra desfazer.
  const losingAdminAccess = updates.role !== 'ADMIN' || updates.status !== 'ACTIVE';
  if (losingAdminAccess && (await isLastActiveAdmin(userId))) {
    return { success: false, error: 'Não é possível remover o acesso do último administrador ativo do sistema.' };
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      name: updates.name,
      email: updates.email,
      role: updates.role,
      status: updates.status,
      permissions: updates.permissions,
      allowed_templates: updates.allowed_templates,
    })
    .eq('id', userId)
    .select()
    .single();

  if (error || !data) return { success: false, error: error?.message || 'Falha ao atualizar o membro.' };
  return { success: true, data };
}

/**
 * Remove um membro da equipe por completo: perfil e credencial de Auth.
 * Se a remoção da credencial falhar, o perfil já removido não é
 * restaurado -- registra o erro mas não bloqueia a operação, já que o
 * objetivo principal (tirar o acesso ao CRM) já foi cumprido.
 */
export async function deleteTeamMember(userId: string): Promise<ServiceResult> {
  if (await isLastActiveAdmin(userId)) {
    return { success: false, error: 'Não é possível remover o último administrador ativo do sistema.' };
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
  if (profileError) return { success: false, error: profileError.message };

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error('Erro ao remover credencial de Auth do membro removido:', authError.message);
  }

  return { success: true };
}

/**
 * Define uma nova senha para um usuário sem exigir a senha atual --
 * uso exclusivo de administradores, para casos de esquecimento (ou de
 * um perfil que nunca teve credencial de acesso de verdade).
 *
 * O caminho normal é profiles.id === auth.users.id (é assim que
 * createUserWithProfile cria contas novas, e é o que o login usa pra
 * achar o perfil depois de autenticar). Três casos, nessa ordem:
 *  1. A atualização direta por id funciona -- caso normal.
 *  2. Existe uma credencial de Auth com o mesmo e-mail do perfil, mas
 *     com um id diferente (perfil criado fora do fluxo padrão do app,
 *     direto no banco) -- atualiza a senha dessa credencial.
 *  3. Não existe credencial nenhuma pra esse e-mail -- o perfil nunca
 *     teve login de verdade. Cria uma nova credencial já com a senha
 *     definida, usando o MESMO id do perfil (a Admin API aceita `id`
 *     no corpo do createUser mesmo sem estar no tipo do SDK) pra não
 *     quebrar o login, que depende de profiles.id === auth.users.id.
 */
export async function adminResetPassword(userId: string, newPassword: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
  if (!error) return { success: true };

  const { data: profile } = await supabaseAdmin.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (!profile?.email) return { success: false, error: error.message };

  const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return { success: false, error: error.message };

  const match = listData.users.find((u) => u.email?.toLowerCase() === profile.email.toLowerCase());
  if (match) {
    const { error: retryError } = await supabaseAdmin.auth.admin.updateUserById(match.id, { password: newPassword });
    if (retryError) return { success: false, error: retryError.message };
    return { success: true };
  }

  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    id: userId,
    email: profile.email,
    password: newPassword,
    email_confirm: true,
  } as Parameters<typeof supabaseAdmin.auth.admin.createUser>[0] & { id: string });

  if (createError) return { success: false, error: createError.message };
  return { success: true };
}

export async function updateOwnProfile(
  userId: string,
  updates: { name: string; phone?: string | null; avatar_url?: string | null }
): Promise<ServiceResult<any>> {
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
    .eq('status', 'ACTIVE')
    .neq('account_type', 'CLIENT');

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
