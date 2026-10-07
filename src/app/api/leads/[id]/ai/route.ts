import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { loadChatLead, setAiPaused } from '@/services/conversations.service';

/** Pausar ou retomar o Atendente com IA nesta conversa (tela Mensagens). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'messages.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.paused !== 'boolean') return NextResponse.json({ error: 'Informe se a IA fica pausada.' }, { status: 400 });

  const lead = await loadChatLead(auth.tenantId, id, auth.profile);
  if ('error' in lead) return NextResponse.json({ error: lead.error }, { status: lead.status });

  const result = await setAiPaused(auth.tenantId, lead.id, body.paused);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ data: { aiPausedUntil: result.aiPausedUntil } });
}
