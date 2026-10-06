import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { cancelSend, isFailure, updateSend } from '@/services/scheduling.service';

type Context = { params: Promise<{ id: string }> };

/** Muda texto/horário de um envio pendente ou reagenda um que falhou/foi cancelado. */
export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireActiveProfile({ module: 'agendamento', permission: 'integrations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const result = await updateSend(auth.tenantId, auth.profile, id, await request.json().catch(() => ({})));
  if (isFailure(result)) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}

/** Cancela um envio que ainda não saiu (fica no histórico como cancelado). */
export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireActiveProfile({ module: 'agendamento', permission: 'integrations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const result = await cancelSend(auth.tenantId, auth.profile, id);
  if (isFailure(result)) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}
