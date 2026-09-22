import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { findProfileByEmail, notifyAdminsOfPasswordResetRequest } from '@/services/users.service';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'E-mail é obrigatório.' }, { status: 400 });
    }

    const userProfile = await findProfileByEmail(email);

    if (!userProfile) {
      return NextResponse.json({ error: 'Nenhum usuário encontrado com este e-mail.' }, { status: 404 });
    }

    await notifyAdminsOfPasswordResetRequest(userProfile);

    await logAudit(
      { id: userProfile.id, name: userProfile.name },
      'SETTINGS_UPDATE',
      `Solicitou uma redefinição de senha para o Administrador.`,
      'profile',
      userProfile.id,
      supabaseAdmin
    );

    return NextResponse.json({ success: true, message: 'Solicitação encaminhada com sucesso ao administrador.' }, { status: 200 });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
