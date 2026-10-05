import { NextResponse } from 'next/server';
import { requireAdminOrManagerProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startFlowForLeads } from '@/lib/automations/engine';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// POST { leadIds: string[] } -- a equipe roda o fluxo para leads escolhidos.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const leadIds = Array.isArray(body.leadIds) ? body.leadIds : [];

  const result = await startFlowForLeads(auth.tenantId, id, leadIds);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  logAudit(
    { id: auth.profile.id, name: auth.profile.name },
    'SETTINGS_UPDATE',
    `Rodou uma automação manualmente para ${result.started} lead(s).`,
    'automation',
    id,
    supabaseAdmin,
    auth.tenantId
  ).catch(() => {});
  return NextResponse.json({ data: result });
}
