import { NextResponse } from 'next/server';
import { createChatGroup } from '@/services/chat.service';

export async function POST(request: Request) {
  try {
    const { name, created_by, members } = await request.json();

    if (!name?.trim() || !created_by || !members?.length) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    const result = await createChatGroup(name, created_by, members);
    if (!result.success) {
      console.error('Erro ao criar grupo:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (result.data!.warning) {
      console.error('Erro ao adicionar membros:', result.data!.warning);
      return NextResponse.json({ group: result.data!.group, warning: result.data!.warning }, { status: 207 });
    }

    return NextResponse.json({ group: result.data!.group }, { status: 201 });
  } catch (err: any) {
    console.error('Erro inesperado ao criar grupo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
