import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { fetchTenantUser, updateTenantUser } from '@/services/tenants.service';
import { deleteTeamMember } from '@/services/users.service';

type Params = { params: Promise<{ id: string; userId: string }> };

// PATCH: muda perfil (ADMIN/MANAGER/SELLER) ou status de um login de cliente.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const { id, userId } = await params;
    if (!(await fetchTenantUser(id, userId))) {
      return NextResponse.json({ error: 'Usuário não pertence a esta empresa.' }, { status: 404 });
    }

    const body = await request.json();
    const updates: { role?: string; status?: string } = {};
    if (['ADMIN', 'MANAGER', 'SELLER'].includes(body.role)) updates.role = body.role;
    if (['ACTIVE', 'INACTIVE'].includes(body.status)) updates.status = body.status;
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 });

    const result = await updateTenantUser(userId, updates);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}

// DELETE: remove o login de cliente (perfil + credencial).
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id, userId } = await params;
  if (!(await fetchTenantUser(id, userId))) {
    return NextResponse.json({ error: 'Usuário não pertence a esta empresa.' }, { status: 404 });
  }
  const result = await deleteTeamMember(userId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
