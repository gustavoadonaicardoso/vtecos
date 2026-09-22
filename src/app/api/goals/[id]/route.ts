import { NextResponse } from 'next/server';
import { deleteGoal, fetchGoalOwner, fetchRequesterProfile, updateGoal } from '@/services/goals.service';
import type { GoalPlan } from '@/lib/goals';

async function getRequester(request: Request) {
  const requesterId = request.headers.get('x-user-id');
  if (!requesterId) return null;
  return fetchRequesterProfile(requesterId);
}

async function canManage(requester: { id: string; role: string }, goalId: string) {
  if (requester.role === 'ADMIN') return true;
  const ownerId = await fetchGoalOwner(goalId);
  return ownerId === requester.id;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getRequester(request);
  if (!requester) {
    return NextResponse.json({ error: 'Usuário sem permissão para editar metas.' }, { status: 403 });
  }

  const { id } = await params;
  if (!(await canManage(requester, id))) {
    return NextResponse.json({ error: 'Você não pode editar este planejamento.' }, { status: 403 });
  }

  try {
    const updates = (await request.json()) as Partial<GoalPlan>;
    const result = await updateGoal(id, updates);
    if (!result.success) {
      console.error('Update goal error:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao atualizar planejamento.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getRequester(request);
  if (!requester) {
    return NextResponse.json({ error: 'Usuário sem permissão para excluir metas.' }, { status: 403 });
  }

  const { id } = await params;
  if (!(await canManage(requester, id))) {
    return NextResponse.json({ error: 'Você não pode excluir este planejamento.' }, { status: 403 });
  }

  const result = await deleteGoal(id);
  if (!result.success) {
    console.error('Delete goal error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
