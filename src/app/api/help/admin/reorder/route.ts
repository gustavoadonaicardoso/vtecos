import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { reorderHelpItems, type HelpTable } from '@/services/help.service';

const TABLES: Record<string, HelpTable> = { category: 'help_categories', article: 'help_articles', faq: 'help_faqs' };

// POST { type, ids }: grava a nova ordem.
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const table = TABLES[String(body.type || '')];
  const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string') : [];
  if (!table || ids.length === 0) return NextResponse.json({ error: 'Informe tipo e ids.' }, { status: 400 });

  const result = await reorderHelpItems(table, ids);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
