import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { fetchTenantById, fetchTenantUsers } from '@/services/tenants.service';
import { createUserWithProfile } from '@/services/users.service';

const CLIENT_ROLES = new Set(['ADMIN', 'MANAGER', 'SELLER']);

// GET: logins de cliente desta empresa (só admin da Vórtice).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const result = await fetchTenantUsers(id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

// POST: cria um login de cliente preso a esta empresa.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePlatformAdmin();
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const { id } = await params;
    const tenant = await fetchTenantById(id);
    if (!tenant) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? body.role : 'ADMIN';

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nome, e-mail e senha são obrigatórios.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    }
    if (!CLIENT_ROLES.has(role)) return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 });

    const result = await createUserWithProfile({ tenantId: id, name, email, password, role, permissions: {} });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
