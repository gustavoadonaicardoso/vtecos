import { NextResponse } from 'next/server';
import { requireActiveProfile, requireAdminOrManagerProfile } from '@/lib/session';
import { createFlow, listFlows } from '@/services/automations.service';

// GET: fluxos da empresa. POST: cria (admin ou gerente).
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'automations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await listFlows(auth.tenantId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'automations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const result = await createFlow(auth.tenantId, auth.profile.id, body);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
