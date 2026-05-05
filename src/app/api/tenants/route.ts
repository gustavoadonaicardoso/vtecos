import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usa a chave de serviço no servidor — bypassa o RLS completamente
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: Lista todos os tenants
export async function GET() {
  const { data, error } = await adminSupabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST: Cria um novo tenant
export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }

    const { data, error } = await adminSupabase
      .from('tenants')
      .insert({ name: name.trim(), status: 'ACTIVE' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
