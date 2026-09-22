import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateOwnProfile } from '@/services/users.service';

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

    const result = await updateOwnProfile(userId, { name, phone, avatar_url });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const updatedProfile = result.data!;

    await logAudit(
      { id: updatedProfile.id, name: updatedProfile.name },
      'SETTINGS_UPDATE',
      `Informações de perfil atualizadas (Nome/Telefone/Foto).`,
      'profile',
      updatedProfile.id,
      supabaseAdmin
    );

    return NextResponse.json({ success: true, data: updatedProfile }, { status: 200 });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
