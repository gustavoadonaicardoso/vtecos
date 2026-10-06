import { NextResponse } from 'next/server';
import { fetchBoardById, updateBoard, deleteBoard, fetchBoardOwner } from '@/services/planning.service';
import { requireActiveProfile } from '@/lib/session';

/** Qualquer usuário ativo pode editar; excluir exige ser quem criou ou ADMIN/MANAGER. */
async function authorizeDelete(boardId: string) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'planejamentos.view' });
  if ('error' in auth) return auth;

  const owner = await fetchBoardOwner(auth.tenantId, boardId);
  if (owner === null) return { error: { message: 'Planejamento não encontrado.', status: 404 } };
  if (auth.profile.role === 'ADMIN' || auth.profile.role === 'MANAGER') return auth;

  const ownerId = await fetchBoardOwner(auth.tenantId, boardId);
  if (ownerId !== auth.profile.id) {
    return { error: { message: 'Você não tem permissão para excluir este planejamento.', status: 403 } };
  }

  return auth;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'planejamentos.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { id } = await params;
  const result = await fetchBoardById(auth.tenantId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ success: true, data: result.data }, { status: 200 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'planejamentos.view' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.description === 'string') updates.description = body.description;
    if ('project_id' in body) updates.project_id = body.project_id || null;
    if (body.canvas_data) updates.canvas_data = body.canvas_data;
    if ('thumbnail_url' in body) updates.thumbnail_url = body.thumbnail_url || null;

    const result = await updateBoard(auth.tenantId, id, updates);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, data: result.data }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeDelete(id);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const result = await deleteBoard(auth.tenantId, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true }, { status: 200 });
}
