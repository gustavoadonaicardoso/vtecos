import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile, requireAdminOrManagerProfile } from '@/lib/session';
import { deleteFlow, getFlow, updateFlow } from '@/services/automations.service';
import { cancelWaitingRuns } from '@/lib/automations/engine';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const flow = await getFlow(auth.tenantId, id);
  if (!flow) return NextResponse.json({ error: 'Fluxo não encontrado.' }, { status: 404 });
  // O endereço secreto do webhook de entrada só aparece para quem edita.
  if (!['ADMIN', 'MANAGER'].includes(auth.profile.role)) flow.webhook_token = null;
  return NextResponse.json({ data: flow });
}

// PATCH { name?, description?, graph?, status?, regenerateToken? }
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const result = await updateFlow(auth.tenantId, id, body);
  if (!result.success) return NextResponse.json({ error: result.error, problems: result.problems || [] }, { status: 400 });

  if (body.status !== undefined) {
    await logAudit(
      { id: auth.profile.id, name: auth.profile.name },
      'SETTINGS_UPDATE',
      `Automação "${result.data!.name}" ficou ${result.data!.status === 'active' ? 'ativa' : result.data!.status === 'paused' ? 'pausada' : 'em rascunho'}.`,
      'automation',
      id,
      supabaseAdmin,
      auth.tenantId
    );
  }
  return NextResponse.json({ data: result.data, problems: result.problems || [], paused: Boolean(result.paused) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  await cancelWaitingRuns(auth.tenantId, id, 'Fluxo excluído.');
  const result = await deleteFlow(auth.tenantId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
