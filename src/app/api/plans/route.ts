import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { createPlan, listPlans, parsePlanInput } from '@/services/plans.service';

// GET: planos de assinatura (só admin -- painel Master).
export async function GET() {
  const auth = await requireAdminProfile();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await listPlans();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminProfile();
    if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

    const parsed = parsePlanInput(await request.json());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const result = await createPlan(parsed.data);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ data: { ...result.data, tenant_count: 0 } }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
