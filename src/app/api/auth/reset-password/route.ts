import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit';

// Admin client to query profiles and insert notifications bypassing RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'E-mail é obrigatório.' }, { status: 400 });
    }

    // 1. Find user profile matching the email
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email')
      .eq('email', email)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'Nenhum usuário encontrado com este e-mail.' }, { status: 404 });
    }

    // 2. Find all Admin users
    const { data: admins, error: adminsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'ADMIN')
      .eq('status', 'ACTIVE');

    if (adminsError || !admins || admins.length === 0) {
      console.warn('Nenhum administrador ativo encontrado no sistema para receber a demanda.');
    } else {
      // 3. Insert notification for each admin
      const notifications = admins.map(admin => ({
        user_id: admin.id,
        type: 'task',
        title: 'Solicitação de Senha',
        content: `O usuário ${userProfile.name} (${userProfile.email}) solicitou a redefinição de sua senha.`,
        is_read: false,
        link: '/users'
      }));

      const { error: notifError } = await supabaseAdmin
        .from('system_notifications')
        .insert(notifications);

      if (notifError) {
        console.error('Erro ao criar notificações para os admins:', notifError.message);
      }
    }

    // 4. Log audit log
    await logAudit(
      { id: userProfile.id, name: userProfile.name },
      'SETTINGS_UPDATE',
      `Solicitou uma redefinição de senha para o Administrador.`,
      'profile',
      userProfile.id
    );

    return NextResponse.json({ success: true, message: 'Solicitação encaminhada com sucesso ao administrador.' }, { status: 200 });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
