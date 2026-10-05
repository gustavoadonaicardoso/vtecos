import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { createSend, isFailure, listSends, sendWorkerEnabled } from '@/services/scheduling.service';

/** Envios agendados (vendedor: só os dele) e se o envio automático está ligado neste servidor. */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'agendamento' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const data = await listSends(auth.tenantId, auth.profile);
    return NextResponse.json({ data, workerEnabled: sendWorkerEnabled() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar os envios.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'agendamento' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await createSend(auth.tenantId, auth.profile, await request.json().catch(() => ({})));
  if (isFailure(result)) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result }, { status: 201 });
}
