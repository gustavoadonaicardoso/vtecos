import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseAuth } from '@/lib/supabase-auth';
import { requireActiveProfile } from '@/lib/session';

/**
 * Troca a própria senha (Configurações > Segurança). Confere a senha
 * atual antes; quem esqueceu a atual pede ao administrador pela tela de
 * login ("Esqueci minha senha").
 */
export async function POST(request: Request) {
  try {
    // permission: open (a própria senha)
    const auth = await requireActiveProfile();
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const body = await request.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword) return NextResponse.json({ error: 'Informe a senha atual.' }, { status: 400 });
    if (newPassword.length < 8) return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
    if (newPassword === currentPassword) return NextResponse.json({ error: 'A nova senha precisa ser diferente da atual.' }, { status: 400 });

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: auth.profile.email.trim().toLowerCase(),
      password: currentPassword,
    });
    if (error || !data.user) return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 });

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password: newPassword });
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    await logAudit(
      { id: auth.profile.id, name: auth.profile.name },
      'SETTINGS_UPDATE',
      'Trocou a própria senha em Configurações.',
      'profile',
      auth.profile.id,
      supabaseAdmin,
      auth.tenantId
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
