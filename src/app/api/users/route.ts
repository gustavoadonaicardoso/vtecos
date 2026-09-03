import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER', 'SELLER']);

/**
 * Lista perfis pelo servidor para não depender do RLS do cliente anon.
 * `scope=chat` retorna somente os campos necessários para o chat;
 * `scope=team` é reservado para administradores e gerentes.
 */
export async function GET(request: Request) {
  try {
    const requesterId = request.headers.get('x-user-id');
    const scope = new URL(request.url).searchParams.get('scope') || 'team';

    if (!requesterId) {
      return NextResponse.json(
        { error: 'Identificação do usuário necessária.' },
        { status: 401 }
      );
    }

    if (scope !== 'chat' && scope !== 'team') {
      return NextResponse.json({ error: 'Escopo inválido.' }, { status: 400 });
    }

    const { data: requester, error: requesterError } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', requesterId)
      .maybeSingle();

    if (
      requesterError ||
      !requester ||
      requester.status !== 'ACTIVE' ||
      (scope === 'team' && !['ADMIN', 'MANAGER'].includes(requester.role))
    ) {
      return NextResponse.json(
        { error: 'Usuário sem permissão para listar estes perfis.' },
        { status: 403 }
      );
    }

    let query = supabaseAdmin
      .from('profiles')
      .select(
        scope === 'chat'
          ? 'id, name, email, role, status, avatar_url'
          : 'id, name, email, role, status, permissions, allowed_templates, phone, avatar_url, created_at'
      )
      .order('name');

    if (scope === 'chat') {
      query = query.eq('status', 'ACTIVE');
    }

    const { data, error } = await query;

    if (error) {
      console.error('List profiles error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] }, { status: 200 });
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
  let createdAuthUserId: string | null = null;

  try {
    const requesterId = request.headers.get('x-user-id');

    if (!requesterId) {
      return NextResponse.json(
        { error: 'Identificação do administrador necessária.' },
        { status: 401 }
      );
    }

    const { data: requester, error: requesterError } = await supabaseAdmin
      .from('profiles')
      .select('role, status')
      .eq('id', requesterId)
      .maybeSingle();

    if (
      requesterError ||
      !requester ||
      requester.status !== 'ACTIVE' ||
      requester.role !== 'ADMIN'
    ) {
      return NextResponse.json(
        { error: 'Apenas administradores ativos podem criar usuários.' },
        { status: 403 }
      );
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

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

    if (authError || !authData.user) {
      const isDuplicate =
        authError?.message.toLowerCase().includes('already') ||
        authError?.message.toLowerCase().includes('exist');

      return NextResponse.json(
        {
          error: isDuplicate
            ? 'Este e-mail já está cadastrado.'
            : authError?.message || 'Não foi possível criar a credencial de acesso.',
        },
        { status: isDuplicate ? 409 : 400 }
      );
    }

    createdAuthUserId = authData.user.id;

    const permissions = body.permissions && typeof body.permissions === 'object'
      ? body.permissions
      : {};

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        name,
        email,
        role,
        status: 'ACTIVE',
        permissions,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (profileError || !profile) {
      // Evita deixar uma credencial sem perfil se a gravação do perfil falhar.
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      createdAuthUserId = null;

      return NextResponse.json(
        { error: profileError?.message || 'Não foi possível criar o perfil do usuário.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: profile }, { status: 201 });
  } catch (error: unknown) {
    if (createdAuthUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
    }

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
