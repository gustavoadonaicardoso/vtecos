import { NextResponse } from 'next/server';
import { signIn } from '@/services/auth.service';
import { fetchProfileByEmail, fetchProfileById } from '@/services/profile-lookup.server';
import { setSessionCookies } from '@/lib/session';
import { withWorkspace } from '@/services/workspace.service';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email e senha obrigatórios' },
        { status: 400 }
      );
    }

    const result = await signIn(email.trim(), password, { byId: fetchProfileById, byEmail: fetchProfileByEmail });

    if (!result.success || !result.data) {
      console.error('Erro no login:', result.error);

      return NextResponse.json(
        { error: result.error || 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    const { profile, session } = result.data;
    await setSessionCookies(session.access_token, session.refresh_token, session.expires_in);

    return NextResponse.json(
      { data: await withWorkspace(profile) },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro na rota de login:', error);

    return NextResponse.json(
      { error: 'Erro interno de autenticação' },
      { status: 500 }
    );
  }
}
