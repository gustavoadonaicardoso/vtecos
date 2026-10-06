import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { buildDashboardSummary } from '@/services/dashboard.service';

/** Números de todos os módulos para o dashboard, filtrados pelas permissões do usuário. */
export async function GET() {
  const auth = await requireActiveProfile({ permission: 'dashboard.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  return NextResponse.json({ success: true, data: await buildDashboardSummary(auth.profile, auth.tenantId, auth.modules) });
}
