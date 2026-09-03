import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Project data is read and written on the server so mobile clients do not
// depend on localStorage or on public Supabase RLS policies.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getRequester(request: Request) {
  const requesterId = request.headers.get('x-user-id');
  if (!requesterId) return null;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('role, status, permissions')
    .eq('id', requesterId)
    .maybeSingle();

  if (error || !data || data.status !== 'ACTIVE') return null;
  return data;
}

export async function GET(request: Request) {
  const requester = await getRequester(request);
  const hasProjectPermission = requester && (
    ['ADMIN', 'MANAGER'].includes(requester.role) ||
    requester.permissions?.admin?.projects === true
  );

  if (!hasProjectPermission) {
    return NextResponse.json(
      { error: 'Usuário sem permissão para visualizar projetos.' },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('action_plans')
    .select('*')
    .order('created_at');

  if (error) {
    console.error('List projects error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] }, { status: 200 });
}

export async function PUT(request: Request) {
  const requester = await getRequester(request);

  if (!requester || requester.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Apenas administradores podem alterar projetos.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    if (!Array.isArray(body.projects)) {
      return NextResponse.json({ error: 'Lista de projetos inválida.' }, { status: 400 });
    }

    const rows = body.projects.map((project: any) => ({
      client_name: String(project.clientName || ''),
      project_name: String(project.projectName || ''),
      status: String(project.status || 'Planejamento'),
      strategies: String(project.strategies || ''),
      weekly_goals: String(project.weeklyGoals || ''),
      commercial_points: String(project.commercialPoints || ''),
      color_gradient: String(project.color || ''),
    }));

    const { error: deleteError } = await supabaseAdmin
      .from('action_plans')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      console.error('Clear projects error:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('action_plans')
        .insert(rows);

      if (insertError) {
        console.error('Save projects error:', insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao salvar projetos.' },
      { status: 500 }
    );
  }
}
