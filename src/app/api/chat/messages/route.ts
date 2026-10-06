import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { sendInternalMessage, editInternalMessage, deleteInternalMessage } from '@/services/chat.service';

// Chat interno da equipe. Quem envia é sempre o usuário da sessão (antes
// o sender_id vinha do navegador e dava para se passar por outra pessoa).

const messageType = (value: unknown) => (value === 'group' ? 'group' : 'direct') as 'group' | 'direct';

export async function POST(request: Request) {
  try {
    const auth = await requireActiveProfile({ permission: 'messages.send' });
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const body = await request.json();
    const type = messageType(body.type);
    const payload = body.payload || {};
    const text = typeof payload.text === 'string' ? payload.text : '';

    if (!text.trim()) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    if (type === 'group' && !payload.group_id) {
      return NextResponse.json({ error: 'group_id obrigatório para mensagens de grupo.' }, { status: 400 });
    }
    if (type === 'direct' && !payload.receiver_id) {
      return NextResponse.json({ error: 'receiver_id obrigatório para mensagens diretas.' }, { status: 400 });
    }

    // Só os campos conhecidos da mensagem; nada de tenant/sender vindo do navegador.
    const allowed: Record<string, unknown> = { text };
    for (const key of ['receiver_id', 'group_id', 'file_url', 'file_name', 'file_type', 'reply_to', 'type', 'audio_url']) {
      if (payload[key] !== undefined) allowed[key] = payload[key];
    }

    const result = await sendInternalMessage(auth.tenantId, auth.profile.id, type, allowed as { text: string });
    if (!result.success) {
      console.error('Erro ao enviar mensagem:', result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ message: result.data }, { status: 201 });
  } catch (err: unknown) {
    console.error('Erro inesperado ao enviar mensagem:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireActiveProfile({ permission: 'messages.send' });
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const { type, id, text } = await request.json();
    if (!id || !text?.trim()) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });

    const result = await editInternalMessage(auth.tenantId, auth.profile.id, messageType(type), id, text);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireActiveProfile({ permission: 'messages.send' });
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const { type, id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 });

    const result = await deleteInternalMessage(auth.tenantId, auth.profile.id, messageType(type), id);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
