import { NextResponse } from 'next/server';
import { requireAdminOrManagerProfile } from '@/lib/session';
import { cancelRun } from '@/services/automations.service';

// DELETE: cancela uma execução que está esperando.
export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { runId } = await params;
  const result = await cancelRun(auth.tenantId, runId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
