import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { ticketAction, type TicketAction } from '@/services/queue.service';

export const runtime = 'nodejs';

const ACTIONS: TicketAction[] = ['call', 'recall', 'finish', 'no_show', 'cancel', 'requeue'];

/** Chamar fora de ordem, chamar de novo, finalizar, não compareceu, cancelar ou devolver à fila. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'senhas', permission: 'integrations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = ACTIONS.find((item) => item === body?.action);
  if (!action) return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });

  const result = await ticketAction({ id: auth.tenantId, name: auth.tenantName }, auth.profile, id, action, typeof body?.desk === 'string' ? body.desk : undefined);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}
