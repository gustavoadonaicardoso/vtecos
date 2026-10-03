import { NextResponse } from 'next/server';
import { deleteGoal, fetchGoalOwner, updateGoal } from '@/services/goals.service';
import { requireActiveProfile } from '@/lib/session';
import type { GoalPlan } from '@/lib/goals';

// Usuário e empresa vêm da sessão (antes: cabeçalho x-user-id, forjável).
async function getRequester() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return null;
  return { tenantId: auth.tenantId, id: auth.profile.id, role: auth.profile.role };
}

async function canManage(requester: { tenantId: string; id: string; role: string }, goalId: string) {
  const ownerId = await fetchGoalOwner(requester.tenantId, goalId);
  if (!ownerId) return false;
  return requester.role === 'ADMIN' || ownerId === requester.id;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: 'Usuário sem permissão para editar metas.' }, { status: 403 });
  }

  const { id } = await params;
  if (!(await canManage(requester, id))) {
    return NextResponse.json({ error: 'Você não pode editar este planejamento.' }, { status: 403 });
  }

  try {
    const updates = (await request.json()) as Partial<GoalPlan>;
    const result = await updateGoal(requester.tenantId, id, updates);
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: 'Usuário sem permissão para excluir metas.' }, { status: 403 });
  }

  const { id } = await params;
  if (!(await canManage(requester, id))) {
    return NextResponse.json({ error: 'Você não pode excluir este planejamento.' }, { status: 403 });
  }

  const result = await deleteGoal(requester.tenantId, id);
  if (!result.success) {
    console.error('Delete goal error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
