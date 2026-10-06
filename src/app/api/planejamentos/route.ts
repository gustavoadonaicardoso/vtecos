import { NextResponse } from 'next/server';
import { fetchBoards, createBoard } from '@/services/planning.service';
import { requireActiveProfile } from '@/lib/session';

export async function GET() {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'planejamentos.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const result = await fetchBoards(auth.tenantId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data }, { status: 200 });
}

export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'planejamentos.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await createBoard(auth.tenantId, {
      name: body.name,
      description: body.description,
      project_id: body.project_id || null,
      canvas_data: body.canvas_data,
      created_by: auth.profile.id,
    });

    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
