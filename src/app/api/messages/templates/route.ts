import { NextRequest, NextResponse } from 'next/server';
import { fetchVisibleTemplates, createTemplate } from '@/services/templates.service';

// GET — lista templates visíveis para o usuário (filtra por allowed_templates se configurado)
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const result = await fetchVisibleTemplates(userId);

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ templates: result.data });
}

// POST — criar template (admin)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, content } = body;

  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Nome e conteúdo são obrigatórios' }, { status: 400 });
  }

  const result = await createTemplate(name, content);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ template: result.data });
}
