import { NextResponse } from 'next/server';
import { sendInternalMessage, editInternalMessage, deleteInternalMessage } from '@/services/chat.service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, payload } = body;
    // type: 'group' | 'direct'
    // payload para group: { sender_id, group_id, text }
    // payload para direct: { sender_id, receiver_id, text }

    if (!type || !payload?.sender_id || !payload?.text?.trim()) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }
    if (type === 'group' && !payload.group_id) {
      return NextResponse.json({ error: 'group_id obrigatório para mensagens de grupo.' }, { status: 400 });
    }
    if (type === 'direct' && !payload.receiver_id) {
      return NextResponse.json({ error: 'receiver_id obrigatório para mensagens diretas.' }, { status: 400 });
    }

    const result = await sendInternalMessage(type, payload);
    if (!result.success) {
      console.error('Erro ao enviar mensagem:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ message: result.data }, { status: 201 });
  } catch (err: any) {
    console.error('Erro inesperado ao enviar mensagem:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { type, id, text } = body;

    if (!id || !text?.trim()) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    const result = await editInternalMessage(type, id, text);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { type, id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id obrigatório.' }, { status: 400 });
    }

    const result = await deleteInternalMessage(type, id);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
