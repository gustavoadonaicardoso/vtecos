import { NextResponse } from 'next/server';
import { requireAdminOrManagerProfile } from '@/lib/session';
import { searchLeads } from '@/services/automations.service';

export const runtime = 'nodejs';

// GET ?q= -- leads para "Rodar para leads" no editor.
export async function GET(request: Request) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'automations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const q = new URL(request.url).searchParams.get('q') || '';
  return NextResponse.json({ data: await searchLeads(auth.tenantId, q) });
}
