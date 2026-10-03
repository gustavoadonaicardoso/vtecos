/**
 * ============================================================
 * VÓRTICE CRM — Users / Profiles Service (server-only)
 * ============================================================
 * Operações administrativas sobre profiles/auth.users que exigem a
 * service role (criação de usuário, listagem completa da equipe).
 * Só deve ser importado por rotas de API — nunca por componentes
 * client-side.
 *
 * Tudo aqui recebe a empresa (tenantId) da sessão: cada empresa só
 * enxerga e administra a própria equipe.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

type Row = Record<string, unknown>;

/**
 * Lista a equipe da empresa.
 * `scope=chat` retorna somente os campos necessários para o chat;
 * `scope=team` é reservado para administradores e gerentes.
 */
export async function fetchProfiles(tenantId: string, scope: 'chat' | 'team'): Promise<ServiceResult<Row[]>> {
  const baseColumns = scope === 'chat'
    ? 'id, name, email, role, status, avatar_url'
    : 'id, name, email, role, status, permissions, allowed_templates, phone, avatar_url, created_at';

  const run = (columns: string) => {
    let query = supabaseAdmin.from('profiles').select(columns).eq('tenant_id', tenantId).order('name');
    if (scope === 'chat') query = query.eq('status', 'ACTIVE');
    return query;
  };

  // last_seen_at alimenta o "Visto há X min"; se a coluna não existir,
  // a lista sai sem ela em vez de quebrar.
  let { data, error } = await run(`${baseColumns}, last_seen_at`);
  if (error) ({ data, error } = await run(baseColumns));

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as unknown as Row[] };
}

/** Perfil desta empresa (null se não existir ou for de outra empresa). */
export async function fetchTenantProfile(tenantId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, role, status, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('id', userId)
    .maybeSingle();
  return data;
}

/**
 * Cria o usuário no Supabase Auth e o respectivo perfil na mesma operação,
 * dentro da empresa informada. Se a gravação do perfil falhar, desfaz a
 * criação da credencial para não deixar um usuário de Auth órfão.
 */
export type CreateUserResult =
  | { success: true; data: Row }
  | { success: false; error: string; status: number };

export async function createUserWithProfile(params: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: string;
  permissions: Record<string, unknown>;
}): Promise<CreateUserResult> {
  const { tenantId, name, email, password, role, permissions } = params;

  const { data: tenant } = await supabaseAdmin.from('tenants').select('id, is_platform').eq('id', tenantId).maybeSingle();
  if (!tenant) return { success: false, status: 400, error: 'Empresa não encontrada.' };

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
    // app_metadata só a service role grava: é dele que o banco tira a empresa.
    app_metadata: { tenant_id: tenantId },
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

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        tenant_id: tenantId,
        account_type: tenant.is_platform ? 'STAFF' : 'CLIENT',
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

/** Verifica se `userId` é o único admin ATIVO restante da empresa. */
async function isLastActiveAdmin(tenantId: string, userId: string): Promise<boolean> {
  const { data: target } = await supabaseAdmin
    .from('profiles')
    .select('role, status')
    .eq('tenant_id', tenantId)
    .eq('id', userId)
    .maybeSingle();

  if (!target || target.role !== 'ADMIN' || target.status !== 'ACTIVE') return false;

  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE');

  return (count ?? 0) <= 1;
}

/**
 * Atualiza os campos administráveis de um membro da equipe (nome, e-mail,
 * cargo, status, permissões e templates liberados). Não mexe em senha —
 * isso é responsabilidade de adminResetPassword, abaixo.
 */
export async function updateTeamMember(
  tenantId: string,
  userId: string,
  updates: {
    name: string;
    email: string;
    role: string;
    status: string;
    permissions: Record<string, unknown>;
    allowed_templates: string[];
  }
): Promise<ServiceResult<Row>> {
  // Se a mudança tira o cargo ADMIN ou desativa o usuário, garante que
  // não é o último admin ativo da empresa -- senão ninguém mais consegue
  // administrar a equipe.
  const losingAdminAccess = updates.role !== 'ADMIN' || updates.status !== 'ACTIVE';
  if (losingAdminAccess && (await isLastActiveAdmin(tenantId, userId))) {
    return { success: false, error: 'Não é possível remover o acesso do último administrador ativo da empresa.' };
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
    .eq('tenant_id', tenantId)
    .eq('id', userId)
    .select()
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Membro não encontrado.' };
  return { success: true, data };
}

/** Aplica as permissões padrão de um cargo a todos da empresa com esse cargo. */
export async function applyRolePermissions(tenantId: string, role: string, permissions: Record<string, unknown>): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from('profiles').update({ permissions }).eq('tenant_id', tenantId).eq('role', role);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Remove um membro da equipe por completo: perfil e credencial de Auth.
 */
export async function deleteTeamMember(tenantId: string, userId: string): Promise<ServiceResult> {
  if (!(await fetchTenantProfile(tenantId, userId))) {
    return { success: false, error: 'Membro não encontrado.' };
  }
  if (await isLastActiveAdmin(tenantId, userId)) {
    return { success: false, error: 'Não é possível remover o último administrador ativo da empresa.' };
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('tenant_id', tenantId).eq('id', userId);
  if (profileError) return { success: false, error: profileError.message };

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error('Erro ao remover credencial de Auth do membro removido:', authError.message);
  }

  return { success: true };
}

/**
 * Define uma nova senha para um usuário da empresa sem exigir a senha
 * atual -- uso exclusivo de administradores.
 *
 * Três casos, nessa ordem:
 *  1. A atualização direta por id funciona -- caso normal.
 *  2. Existe uma credencial de Auth com o mesmo e-mail do perfil, mas
 *     com um id diferente (perfil antigo) -- atualiza essa credencial.
 *  3. Não existe credencial -- cria uma com o MESMO id do perfil.
 */
export async function adminResetPassword(tenantId: string, userId: string, newPassword: string): Promise<ServiceResult> {
  const profile = await fetchTenantProfile(tenantId, userId);
  if (!profile) return { success: false, error: 'Membro não encontrado.' };

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
  if (!error) return { success: true };

  if (!profile.email) return { success: false, error: error.message };

  const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return { success: false, error: error.message };

  const match = listData.users.find((u) => u.email?.toLowerCase() === String(profile.email).toLowerCase());
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
    app_metadata: { tenant_id: tenantId },
  } as Parameters<typeof supabaseAdmin.auth.admin.createUser>[0] & { id: string });

  if (createError) return { success: false, error: createError.message };
  return { success: true };
}

export async function updateOwnProfile(
  tenantId: string,
  userId: string,
  updates: { name: string; phone?: string | null; avatar_url?: string | null }
): Promise<ServiceResult<Row>> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      name: updates.name,
      phone: updates.phone || null,
      avatar_url: updates.avatar_url || null,
    })
    .eq('tenant_id', tenantId)
    .eq('id', userId)
    .select()
    .single();

  if (error || !data) return { success: false, error: error?.message || 'Falha ao atualizar perfil.' };
  return { success: true, data };
}

/** Busca por e-mail (tela "esqueci a senha"): a empresa vem do próprio perfil. */
export async function findProfileByEmail(email: string) {
  // tenant-scope: ok (login público; a empresa é lida do próprio perfil e usada abaixo)
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, tenant_id')
    .eq('email', email.trim().toLowerCase())
    .single();

  if (error || !data) return null;
  return data as { id: string; name: string; email: string; tenant_id: string };
}

/** Notifica os admins ativos DA EMPRESA do usuário que pediu nova senha. */
export async function notifyAdminsOfPasswordResetRequest(userProfile: { id: string; name: string; email: string; tenant_id: string }) {
  const { data: admins, error: adminsError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('tenant_id', userProfile.tenant_id)
    .eq('role', 'ADMIN')
    .eq('status', 'ACTIVE');

  if (adminsError || !admins || admins.length === 0) {
    console.warn('Nenhum administrador ativo encontrado na empresa para receber a demanda.');
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
