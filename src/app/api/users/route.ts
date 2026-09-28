import { NextResponse } from 'next/server';
import { fetchProfiles, createUserWithProfile } from '@/services/users.service';
import { requireActiveProfile, requireAdminProfile, requireAdminOrManagerProfile } from '@/lib/session';

const ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER', 'SELLER']);

/**
 * Lista perfis pelo servidor para não depender do RLS do cliente anon.
 * `scope=chat` retorna somente os campos necessários para o chat;
 * `scope=team` é reservado para administradores e gerentes.
 */
export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get('scope') || 'team';

    if (scope !== 'chat' && scope !== 'team') {
      return NextResponse.json({ error: 'Escopo inválido.' }, { status: 400 });
    }

    const auth = scope === 'team' ? await requireAdminOrManagerProfile() : await requireActiveProfile();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const result = await fetchProfiles(scope);
    if (!result.success) {
      console.error('List profiles error:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (error: unknown) {
    console.error('List profiles error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno ao listar usuários.' },
      { status: 500 }
    );
  }
}

/**
 * Cria o usuário no Supabase Auth e o respectivo perfil na mesma operação.
 * A chave de serviço fica exclusivamente no servidor.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? body.role : 'SELLER';

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Nome, e-mail e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'A senha deve ter pelo menos 8 caracteres.' },
        { status: 400 }
      );
    }

    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 });
    }

    const permissions = body.permissions && typeof body.permissions === 'object'
      ? body.permissions
      : {};

    const result = await createUserWithProfile({ name, email, password, role, permissions });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error: unknown) {
    console.error('Create user error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : 'Erro interno ao criar usuário.',
      },
      { status: 500 }
    );
  }
}
