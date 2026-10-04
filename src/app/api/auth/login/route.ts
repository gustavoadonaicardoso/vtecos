import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signIn } from '@/services/auth.service';
import { fetchProfileByEmail, fetchProfileById } from '@/services/profile-lookup.server';
import { setSessionCookies } from '@/lib/session';
import { withWorkspace } from '@/services/workspace.service';

/** Mensagens do Supabase Auth (em inglês) para o português da tela de login. */
function friendlyError(message?: string) {
  const text = (message || '').toLowerCase();
  if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (text.includes('email not confirmed')) return 'Este acesso ainda não foi confirmado. Fale com o administrador da sua empresa.';
  if (text.includes('rate limit') || text.includes('too many')) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (text.includes('perfil correspondente')) return 'Seu acesso ainda não foi liberado. Fale com o administrador da sua empresa.';
  if (text.includes('desativada')) return message!;
  return 'Não foi possível entrar. Confira o e-mail e a senha.';
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
    }

    const result = await signIn(String(email).trim(), String(password), { byId: fetchProfileById, byEmail: fetchProfileByEmail });

    if (!result.success || !result.data) {
      console.error('Erro no login:', result.error);
      return NextResponse.json({ error: friendlyError(result.error) }, { status: 401 });
    }

    const { profile, session } = result.data;
    const user = await withWorkspace(profile);

    // Empresa suspensa/inativa: antes o login passava e a pessoa caía num
    // sistema vazio, sem explicação. Agora nem cria a sessão.
    const workspace = user.workspace;
    if (workspace && !workspace.is_platform && workspace.tenant_status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'O acesso da sua empresa está suspenso. Fale com a Vórtice Tecnologia para reativar.' },
        { status: 403 }
      );
    }

    await setSessionCookies(session.access_token, session.refresh_token, session.expires_in);

    if (profile.tenant_id) {
      await logAudit(
        { id: profile.id, name: profile.name },
        'LOGIN',
        `Usuário ${profile.name} (${profile.role}) fez login no sistema.`,
        'profile',
        profile.id,
        supabaseAdmin,
        profile.tenant_id
      ).catch(() => {});
    }

    return NextResponse.json({ data: user }, { status: 200 });
  } catch (error) {
    console.error('Erro na rota de login:', error);
    return NextResponse.json({ error: 'Erro interno de autenticação. Tente de novo em instantes.' }, { status: 500 });
  }
}
