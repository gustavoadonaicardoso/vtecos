import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { listCustomFields, saveCustomFields } from '@/services/lead-fields.service';

/** Campos personalizados dos leads (Leads > Campos). Todos veem; administrador e gerente editam. */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm', permission: ['leads.view', 'pipeline.view', 'messages.view', 'automations.view'] });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await listCustomFields(auth.tenantId) });
}

export async function PUT(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (!['ADMIN', 'MANAGER'].includes(auth.profile.role)) return NextResponse.json({ error: 'Só administradores e gerentes mudam os campos.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const result = await saveCustomFields(auth.tenantId, body.fields);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', `Alterou os campos personalizados dos leads (${result.data!.length}).`, 'lead_fields', 'custom', supabaseAdmin, auth.tenantId).catch(() => {});
  return NextResponse.json({ data: result.data });
}
