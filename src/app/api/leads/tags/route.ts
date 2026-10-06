import { NextResponse } from 'next/server';
import { requireActiveProfile, requireAdminOrManagerProfile } from '@/lib/session';
import { createLeadTag, deleteLeadTag, listLeadTags, updateLeadTag } from '@/services/leads.service';

/** Etiquetas da empresa: todos veem; admin e gerente criam, editam e apagam. */
export async function GET() {
  // permission: open (lista de etiquetas, usada em todas as telas do CRM)
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await listLeadTags(auth.tenantId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const result = await createLeadTag(auth.tenantId, String(body.name || ''), String(body.color || ''));
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const result = await updateLeadTag(auth.tenantId, String(body.name || ''), { name: body.newName, color: body.color });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const name = new URL(request.url).searchParams.get('name') || '';
  if (!name) return NextResponse.json({ error: 'Informe a etiqueta.' }, { status: 400 });
  const result = await deleteLeadTag(auth.tenantId, name);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
