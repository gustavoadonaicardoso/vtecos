import { NextResponse } from 'next/server';
import { parseTenantInput, updateTenant } from '@/services/tenants.service';
import { requireAdminProfile } from '@/lib/session';

// PATCH: altera nome, status, plano e dados de contato da empresa (só admin).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const { id } = await params;
    const parsed = parseTenantInput(await request.json(), true);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await updateTenant(id, parsed.data);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
