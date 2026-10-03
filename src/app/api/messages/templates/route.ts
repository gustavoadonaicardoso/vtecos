import { NextRequest, NextResponse } from 'next/server';
import { requireActiveProfile, requireAdminOrManagerProfile } from '@/lib/session';
import { fetchVisibleTemplates, createTemplate } from '@/services/templates.service';

// GET — templates da empresa visíveis para o usuário da sessão
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await fetchVisibleTemplates(auth.tenantId, auth.profile.id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ templates: result.data });
}

// POST — criar template (admin/gerente da empresa)
export async function POST(req: NextRequest) {
  const auth = await requireAdminOrManagerProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const { name, content } = await req.json();
  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Nome e conteúdo são obrigatórios' }, { status: 400 });
  }

  const result = await createTemplate(auth.tenantId, name, content);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ template: result.data });
}
