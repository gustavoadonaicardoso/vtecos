import { NextResponse } from 'next/server';
import { fetchTenants, createTenant, parseTenantInput } from '@/services/tenants.service';
import { requireAdminProfile } from '@/lib/session';

// GET: Lista todos os tenants (só admin -- painel Master)
export async function GET() {
  const auth = await requireAdminProfile();
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
    const auth = await requireAdminProfile();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const parsed = parseTenantInput(await request.json(), false);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await createTenant(parsed.data);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
