import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { createChatGroup } from '@/services/chat.service';

export async function POST(request: Request) {
  try {
    const auth = await requireActiveProfile({ permission: 'messages.send' });
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const { name, members } = await request.json();
    if (!name?.trim() || !Array.isArray(members) || members.length === 0) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    // Criador = usuário da sessão; membros precisam ser da mesma empresa.
    const result = await createChatGroup(auth.tenantId, name, auth.profile.id, members.filter((id: unknown) => typeof id === 'string'));
    if (!result.success) {
      console.error('Erro ao criar grupo:', result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (result.data!.warning) {
      console.error('Erro ao adicionar membros:', result.data!.warning);
      return NextResponse.json({ group: result.data!.group, warning: result.data!.warning }, { status: 207 });
    }

    return NextResponse.json({ group: result.data!.group }, { status: 201 });
  } catch (err: unknown) {
    console.error('Erro inesperado ao criar grupo:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
