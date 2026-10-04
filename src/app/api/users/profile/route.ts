import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { updateOwnProfile } from '@/services/users.service';
import { requireActiveProfile } from '@/lib/session';

export async function PATCH(request: Request) {
  try {
    const auth = await requireActiveProfile();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : '';

    if (!name) {
      return NextResponse.json({ error: 'Nome completo é obrigatório.' }, { status: 400 });
    }

    // Sempre a partir da sessão verificada -- nunca de um id enviado pelo
    // cliente, senão qualquer um poderia editar o perfil de outra pessoa
    // chamando esta rota com um x-user-id forjado.
    const result = await updateOwnProfile(auth.tenantId, auth.profile.id, { name, phone });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const updatedProfile = result.data!;

    await logAudit(
      { id: auth.profile.id, name: String(updatedProfile.name) },
      'SETTINGS_UPDATE',
      'Informações de perfil atualizadas (nome e telefone).',
      'profile',
      auth.profile.id,
      supabaseAdmin,
      auth.tenantId
    );

    return NextResponse.json({ success: true, data: updatedProfile }, { status: 200 });
  } catch (error: unknown) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
