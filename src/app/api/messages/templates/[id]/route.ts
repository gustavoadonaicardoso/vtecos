import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrManagerProfile } from '@/lib/session';
import { updateTemplate, deactivateTemplate, parseQuickReply } from '@/services/templates.service';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'messages.templates' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = parseQuickReply(body, true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateTemplate(auth.tenantId, id, parsed.value);
  if (!result.success) {
    const status = /não encontrada/i.test(result.error || '') ? 404 : /atalho/i.test(result.error || '') ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
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
