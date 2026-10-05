import { NextResponse } from 'next/server';
import { requireQueueManager } from '@/lib/queue-display-access';
import { closeQueueDay } from '@/services/queue.service';

/** Fim do expediente: encerra a fila de hoje sem apagar o histórico. */
export async function POST() {
  const auth = await requireQueueManager('Só administradores e gerentes encerram a fila do dia.');
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await closeQueueDay({ id: auth.tenantId, name: auth.tenantName }, auth.profile);
  return NextResponse.json({ data: result });
}
