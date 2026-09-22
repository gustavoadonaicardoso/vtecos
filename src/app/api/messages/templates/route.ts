import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET — lista templates visíveis para o usuário (filtra por allowed_templates se configurado)
export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin;
  const userId = req.nextUrl.searchParams.get('userId');

  const { data: templates, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se userId fornecido, filtra por allowed_templates do perfil
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('allowed_templates')
      .eq('id', userId)
      .single();

    const allowed: string[] = profile?.allowed_templates ?? [];
    // Array vazio = acesso a todos
    const visible = allowed.length > 0
      ? (templates ?? []).filter((t: any) => allowed.includes(t.id))
      : (templates ?? []);

    return NextResponse.json({ templates: visible });
  }

  return NextResponse.json({ templates: templates ?? [] });
}

// POST — criar template (admin)
export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin;
  const body = await req.json();
  const { name, content } = body;

  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Nome e conteúdo são obrigatórios' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('message_templates')
    .insert([{ name: name.trim(), content: content.trim() }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
