import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { buildReport, resolveRange } from '@/services/reports.service';

/**
 * Números do Início e dos Relatórios: ?period=today|7|30|90|month|custom
 * (&from=AAAA-MM-DD&to=AAAA-MM-DD). Vendedor recebe só os próprios números.
 */
export async function GET(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm', permission: ['dashboard.kpis', 'dashboard.view'] });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const params = new URL(request.url).searchParams;
  const range = resolveRange(params.get('period'), params.get('from'), params.get('to'));
  if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const result = await buildReport(auth.tenantId, auth.profile, range);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}
