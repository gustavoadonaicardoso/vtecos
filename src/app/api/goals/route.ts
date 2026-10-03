import { NextResponse } from 'next/server';
import { createGoal, fetchVisibleGoals } from '@/services/goals.service';
import { requireActiveProfile } from '@/lib/session';
import type { GoalPlan } from '@/lib/goals';

// Antes o usuário vinha do cabeçalho x-user-id (forjável). Agora vem da
// sessão, junto com a empresa.
async function getRequester() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return null;
  return { tenantId: auth.tenantId, requester: { id: auth.profile.id, role: auth.profile.role, status: auth.profile.status } };
}

export async function GET() {
  const ctx = await getRequester();
  if (!ctx) {
    return NextResponse.json({ error: 'Usuário sem permissão para visualizar metas.' }, { status: 403 });
  }

  const result = await fetchVisibleGoals(ctx.tenantId, ctx.requester);
  if (!result.success) {
    console.error('List goals error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}

export async function POST(request: Request) {
  const ctx = await getRequester();
  if (!ctx) {
    return NextResponse.json({ error: 'Usuário sem permissão para criar metas.' }, { status: 403 });
  }

  try {
    const goal = (await request.json()) as GoalPlan;
    if (!goal.title || !goal.id || goal.ownerId !== ctx.requester.id) {
      return NextResponse.json({ error: 'Dados do planejamento inválidos.' }, { status: 400 });
    }

    const result = await createGoal(ctx.tenantId, goal);
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
