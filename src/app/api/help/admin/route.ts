import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import {
  deleteHelpItem,
  fetchHelpContent,
  parseArticle,
  parseCategory,
  parseFaq,
  saveHelpItem,
  type HelpTable,
} from '@/services/help.service';

const TABLES: Record<string, HelpTable> = { category: 'help_categories', article: 'help_articles', faq: 'help_faqs' };
const PARSERS = { category: parseCategory, article: parseArticle, faq: parseFaq } as const;

// GET: tudo (inclusive rascunhos) para o editor do Painel Master.
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    return NextResponse.json({ data: await fetchHelpContent({ includeDrafts: true }) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao carregar.' }, { status: 500 });
  }
}

// POST { type, id?, item }: cria ou atualiza categoria, artigo ou pergunta.
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const body = await request.json();
    const type = String(body.type || '') as keyof typeof PARSERS;
    if (!TABLES[type]) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });

    const parsed = PARSERS[type]((body.item || {}) as Record<string, unknown>);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const id = typeof body.id === 'string' && body.id ? body.id : null;
    const result = await saveHelpItem(TABLES[type], id, parsed.data as Record<string, unknown>);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}

// DELETE ?type=&id=
export async function DELETE(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const params = new URL(request.url).searchParams;
  const table = TABLES[params.get('type') || ''];
  const id = params.get('id');
  if (!table || !id) return NextResponse.json({ error: 'Informe tipo e id.' }, { status: 400 });

  const result = await deleteHelpItem(table, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
