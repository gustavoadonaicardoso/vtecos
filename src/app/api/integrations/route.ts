import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminProfile } from '@/lib/session';

/**
 * integrations_config guarda credenciais sensíveis (tokens, secrets).
 * A tabela é restrita a `authenticated` no Postgres, mas o navegador
 * nunca tem sessão real do Supabase Auth (é sempre `anon`) -- então
 * salvar/ler direto do cliente sempre falhava silenciosamente. Esta
 * rota roda com supabaseAdmin no servidor, gated por sessão de admin.
 */
export async function GET() {
  const auth = await requireAdminProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { data, error } = await supabaseAdmin.from('integrations_config').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 200 });
}

export async function POST(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  try {
    const { provider, config } = await request.json();
    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'provider é obrigatório.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('integrations_config').upsert(
      { provider, config: config ?? {}, updated_at: new Date().toISOString() },
      { onConflict: 'provider' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const provider = new URL(request.url).searchParams.get('provider');
  if (!provider) {
    return NextResponse.json({ error: 'provider é obrigatório.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('integrations_config').delete().eq('provider', provider);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 200 });
}
