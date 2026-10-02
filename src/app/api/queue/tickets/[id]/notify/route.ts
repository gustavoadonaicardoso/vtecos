import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { notifyTicketCall } from '@/services/queue.service';

export const runtime = 'nodejs';

/** Recepção chamou (ou rechamou) a senha: avisa a pessoa no WhatsApp. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const kind = body?.kind === 'recall' ? 'recall' : 'call';

  const result = await notifyTicketCall(id, kind);
  return NextResponse.json({ success: true, data: result });
}
