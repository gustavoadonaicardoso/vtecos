import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { callNextTicket } from '@/services/queue.service';

export const runtime = 'nodejs';

/** Encerra o atendimento do guichê e chama a próxima senha (preferenciais primeiro). */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'senhas' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const result = await callNextTicket({ id: auth.tenantId, name: auth.tenantName }, auth.profile, String(body?.desk ?? ''));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result });
}
