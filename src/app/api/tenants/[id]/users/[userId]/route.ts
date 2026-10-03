import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { fetchTenantUser, updateTenantUser } from '@/services/tenants.service';
import { adminResetPassword, deleteTeamMember } from '@/services/users.service';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';

type Params = { params: Promise<{ id: string; userId: string }> };

// PATCH: muda perfil (ADMIN/MANAGER/SELLER), status ou senha de um login de cliente.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requirePlatformAdmin();
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const { id, userId } = await params;
    if (!(await fetchTenantUser(id, userId))) {
      return NextResponse.json({ error: 'Usuário não pertence a esta empresa.' }, { status: 404 });
    }

    const body = await request.json();

    // Senha nova: a rota /api/users/[id]/password só alcança a equipe da
    // própria empresa (Vórtice); aqui o Master redefine a de um cliente.
    if ('password' in body) {
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 8) return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
      const result = await adminResetPassword(id, userId, password);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      await logAudit(
        { id: auth.profile.id, name: auth.profile.name },
        'SETTINGS_UPDATE',
        `Painel Master: redefiniu a senha do usuário ${userId} da empresa ${id}.`,
        'profile',
        userId,
        supabaseAdmin,
        auth.tenantId
      );
      return NextResponse.json({ success: true });
    }

    const updates: { role?: string; status?: string } = {};
    if (['ADMIN', 'MANAGER', 'SELLER'].includes(body.role)) updates.role = body.role;
    if (['ACTIVE', 'INACTIVE'].includes(body.status)) updates.status = body.status;
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 });

    const result = await updateTenantUser(id, userId, updates);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}

// DELETE: remove o login de cliente (perfil + credencial).
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id, userId } = await params;
  if (!(await fetchTenantUser(id, userId))) {
    return NextResponse.json({ error: 'Usuário não pertence a esta empresa.' }, { status: 404 });
  }
  const result = await deleteTeamMember(id, userId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
