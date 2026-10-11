import { NextRequest, NextResponse } from 'next/server';
import { requireActiveProfile, requireAdminOrManagerProfile } from '@/lib/session';
import { fetchVisibleTemplates, createTemplate, parseQuickReply } from '@/services/templates.service';

// GET — respostas rápidas da empresa visíveis para o usuário da sessão.
// ?all=1 (admin/gerente): todas, para a tela de configuração.
export async function GET(req: NextRequest) {
  const auth = await requireActiveProfile({ module: 'crm', permission: ['messages.templates', 'integrations.view'] });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const manager = auth.profile.role === 'ADMIN' || auth.profile.role === 'MANAGER';
  const all = manager && req.nextUrl.searchParams.get('all') === '1';
  const result = await fetchVisibleTemplates(auth.tenantId, auth.profile.id, { all });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ templates: result.data, canManage: manager });
}

// POST — criar resposta rápida (admin/gerente da empresa)
export async function POST(req: NextRequest) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm', permission: 'messages.templates' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await req.json().catch(() => ({}));
  const parsed = parseQuickReply(body, false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await createTemplate(auth.tenantId, parsed.value);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: /atalho/i.test(result.error || '') ? 409 : 500 });
  return NextResponse.json({ template: result.data });
}
