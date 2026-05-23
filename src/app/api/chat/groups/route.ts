import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client bypasses RLS — só roda no servidor
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { name, created_by, members } = await request.json();

    if (!name?.trim() || !created_by || !members?.length) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    // 1. Criar o grupo
    const { data: groupData, error: groupError } = await supabaseAdmin
      .from('chat_groups')
      .insert([{ name: name.trim(), created_by }])
      .select()
      .single();

    if (groupError || !groupData) {
      console.error('Erro ao criar grupo:', groupError);
      return NextResponse.json({ error: groupError?.message || 'Erro ao criar grupo.' }, { status: 500 });
    }

    // 2. Adicionar membros (inclui o criador)
    const memberIds: string[] = Array.from(new Set([...members, created_by]));
    const membersToInsert = memberIds.map((userId: string) => ({
      group_id: groupData.id,
      user_id: userId,
      is_admin: userId === created_by,
    }));

    const { error: membersError } = await supabaseAdmin
      .from('chat_group_members')
      .insert(membersToInsert);

    if (membersError) {
      console.error('Erro ao adicionar membros:', membersError);
      // Grupo foi criado mas membros falharam — retorna o grupo mesmo assim
      return NextResponse.json({ group: groupData, warning: membersError.message }, { status: 207 });
    }

    return NextResponse.json({ group: groupData }, { status: 201 });
  } catch (err: any) {
    console.error('Erro inesperado ao criar grupo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
