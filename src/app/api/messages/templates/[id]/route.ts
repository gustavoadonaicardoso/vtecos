import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrManagerProfile } from '@/lib/session';
import { updateTemplate, deactivateTemplate } from '@/services/templates.service';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'messages.templates' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const body = await req.json();
  const result = await updateTemplate(auth.tenantId, id, { name: body.name, content: body.content });

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'messages.templates' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const result = await deactivateTemplate(auth.tenantId, id);

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
