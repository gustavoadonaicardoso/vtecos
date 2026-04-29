import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  const supabase = getSupabase();

  if (type === 'user') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('status', 'ACTIVE')
      .order('name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const options = (data ?? []).map((u: any) => ({
      id: u.id,
      label: `${u.name} (${u.role})`,
    }));

    return NextResponse.json({ options });
  }

  if (type === 'stage') {
    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('id, name, color')
      .order('position');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const options = (data ?? []).map((s: any) => ({
      id: s.id,
      label: s.name,
    }));

    return NextResponse.json({ options });
  }

  return NextResponse.json({ error: 'type deve ser "user" ou "stage"' }, { status: 400 });
}
