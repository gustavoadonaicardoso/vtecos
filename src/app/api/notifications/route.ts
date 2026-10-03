import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireActiveProfile } from '@/lib/session';

/**
 * system_notifications tinha RLS `using (true)` para anon -- qualquer
 * pessoa com a chave pública do site podia ler, marcar como lida ou
 * apagar a notificação de QUALQUER outro usuário (prévia de chat,
 * atribuição de lead, links). O filtro por user_id nas telas era só
 * convenção do cliente, não segurança de verdade. Agora todo acesso
 * passa por aqui, sempre restrito à sessão autenticada.
 */
export async function GET(request: Request) {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { searchParams } = new URL(request.url);
  const countOnly = searchParams.get('countOnly') === '1';
  const limit = Number(searchParams.get('limit')) || 10;

  if (countOnly) {
    const { count, error } = await supabaseAdmin
      .from('system_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', auth.profile.id)
      .eq('is_read', false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ count: count || 0 }, { status: 200 });
  }

  const { data, error } = await supabaseAdmin
    .from('system_notifications')
    .select('*')
    .eq('user_id', auth.profile.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] }, { status: 200 });
}

export async function PATCH(request: Request) {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const body = await request.json();

  if (body.all) {
    const { error } = await supabaseAdmin
      .from('system_notifications')
      .update({ is_read: true })
      .eq('user_id', auth.profile.id)
      .eq('is_read', false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('system_notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', auth.profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE() {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { error } = await supabaseAdmin
    .from('system_notifications')
    .delete()
    .eq('user_id', auth.profile.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 200 });
}
