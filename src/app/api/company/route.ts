import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile, requireAdminProfile } from '@/lib/session';
import { fetchCompany, parseCompanyInput, updateCompany } from '@/services/company.service';

// GET: cadastro e plano da empresa de quem está logado.
export async function GET() {
  // permission: open (nome e logo da empresa, para todos)
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await fetchCompany(auth.tenantId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}

// PATCH: só o administrador da empresa altera o cadastro dela.
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const parsed = parseCompanyInput(await request.json());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await updateCompany(auth.tenantId, parsed.data);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

    await logAudit(
      { id: auth.profile.id, name: auth.profile.name },
      'SETTINGS_UPDATE',
      'Atualizou os dados da empresa em Configurações.',
      'tenant',
      auth.tenantId,
      supabaseAdmin,
      auth.tenantId
    );

    const fresh = await fetchCompany(auth.tenantId);
    return NextResponse.json({ data: fresh.success ? fresh.data : null });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
