import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { applyRolePermissions } from '@/services/users.service';
import { sanitizePermissions } from '@/lib/permissions.constants';

const ROLES = new Set(['ADMIN', 'MANAGER', 'SELLER']);

/** Aplica as permissões de um cargo a todos da MESMA empresa com esse cargo. */
export async function PUT(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { role, permissions } = await request.json().catch(() => ({}));
  if (!ROLES.has(role) || !permissions || typeof permissions !== 'object') {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const result = await applyRolePermissions(auth.tenantId, role, sanitizePermissions(permissions));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
