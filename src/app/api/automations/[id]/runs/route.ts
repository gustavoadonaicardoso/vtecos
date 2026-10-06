import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { listRuns } from '@/services/automations.service';

// GET: últimas 50 execuções do fluxo (com o lead e cada passo).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'automations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  return NextResponse.json({ data: await listRuns(auth.tenantId, id) });
}
