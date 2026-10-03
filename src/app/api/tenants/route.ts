import { NextResponse } from 'next/server';
import { fetchTenants, createTenant, parseTenantInput } from '@/services/tenants.service';
import { createUserWithProfile } from '@/services/users.service';
import { requirePlatformAdmin } from '@/lib/session';

// GET: Lista todos os tenants (só admin -- painel Master)
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const result = await fetchTenants();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

// POST: Cria um novo tenant (só admin -- painel Master)
export async function POST(request: Request) {
  try {
    const auth = await requirePlatformAdmin();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const body = await request.json();
    const parsed = parseTenantInput(body, false);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    // Administrador inicial (opcional): já entrega a empresa pronta para o cliente entrar.
    const admin = body.admin && typeof body.admin === 'object' ? body.admin as Record<string, unknown> : null;
    const adminName = typeof admin?.name === 'string' ? admin.name.trim() : '';
    const adminEmail = typeof admin?.email === 'string' ? admin.email.trim().toLowerCase() : '';
    const adminPassword = typeof admin?.password === 'string' ? admin.password : '';
    const wantsAdmin = Boolean(adminName || adminEmail || adminPassword);
    if (wantsAdmin && (!adminName || !adminEmail || adminPassword.length < 8)) {
      return NextResponse.json({ error: 'Para criar o administrador informe nome, e-mail e senha (8+ caracteres).' }, { status: 400 });
    }

    const result = await createTenant(parsed.data);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

    let adminWarning: string | null = null;
    if (wantsAdmin) {
      const created = await createUserWithProfile({
        tenantId: result.data!.id as string,
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        role: 'ADMIN',
        permissions: {},
      });
      if (!created.success) adminWarning = `Empresa criada, mas o administrador não: ${created.error}`;
    }

    return NextResponse.json(
      { data: { ...result.data, user_count: wantsAdmin && !adminWarning ? 1 : 0 }, warning: adminWarning },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
