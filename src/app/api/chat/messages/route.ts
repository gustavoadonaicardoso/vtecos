import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client bypassa RLS — só roda no servidor
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const table = type === 'group' ? 'chat_group_messages' : 'internal_chat';

    if (type === 'group' && !payload.group_id) {
      return NextResponse.json({ error: 'group_id obrigatório para mensagens de grupo.' }, { status: 400 });
    }
    if (type === 'direct' && !payload.receiver_id) {
      return NextResponse.json({ error: 'receiver_id obrigatório para mensagens diretas.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from(table)
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Erro ao enviar mensagem:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data }, { status: 201 });
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

    const table = type === 'group' ? 'chat_group_messages' : 'internal_chat';

    const { error } = await supabaseAdmin
      .from(table)
      .update({ text: text.trim(), is_edited: true })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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

    const table = type === 'group' ? 'chat_group_messages' : 'internal_chat';

    const { error } = await supabaseAdmin.from(table).delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
