import { NextResponse } from 'next/server';
import { createGoal, fetchRequesterProfile, fetchVisibleGoals } from '@/services/goals.service';
import type { GoalPlan } from '@/lib/goals';

async function getRequester(request: Request) {
  const requesterId = request.headers.get('x-user-id');
  if (!requesterId) return null;
  return fetchRequesterProfile(requesterId);
}

export async function GET(request: Request) {
  const requester = await getRequester(request);
  if (!requester) {
    return NextResponse.json({ error: 'Usuário sem permissão para visualizar metas.' }, { status: 403 });
  }

  const result = await fetchVisibleGoals(requester);
  if (!result.success) {
    console.error('List goals error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}

export async function POST(request: Request) {
  const requester = await getRequester(request);
  if (!requester) {
    return NextResponse.json({ error: 'Usuário sem permissão para criar metas.' }, { status: 403 });
  }

  try {
    const goal = (await request.json()) as GoalPlan;
    if (!goal.title || !goal.id || goal.ownerId !== requester.id) {
      return NextResponse.json({ error: 'Dados do planejamento inválidos.' }, { status: 400 });
    }

    const result = await createGoal(goal);
    if (!result.success) {
      console.error('Create goal error:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao criar planejamento.' },
      { status: 500 }
    );
  }
}
