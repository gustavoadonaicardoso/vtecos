import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { isFailure, previewSend } from '@/services/scheduling.service';

/** Prévia de uma mensagem agendada com as variáveis trocadas pelos dados do lead. */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'agendamento', permission: 'integrations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await previewSend(auth.tenantId, auth.profile, await request.json().catch(() => ({})));
  if (isFailure(result)) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}
