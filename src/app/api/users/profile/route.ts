import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(request: Request) {
  try {
    const userId = request.headers.get('x-user-id');
    const { name, phone, avatar_url } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Identificação de usuário necessária.' }, { status: 401 });
    }

    if (!name) {
      return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 });
    }

    // Update profiles table
    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update({
        name,
        phone: phone || null,
        avatar_url: avatar_url || null
      })
      .eq('id', userId)
      .select()
      .single();

    if (error || !updatedProfile) {
      return NextResponse.json({ error: error?.message || 'Falha ao atualizar perfil.' }, { status: 400 });
    }

    // Log audit log
    await logAudit(
      { id: updatedProfile.id, name: updatedProfile.name },
      'SETTINGS_UPDATE',
      `Informações de perfil atualizadas (Nome/Telefone/Foto).`,
      'profile',
      updatedProfile.id
    );

    return NextResponse.json({ success: true, data: updatedProfile }, { status: 200 });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
