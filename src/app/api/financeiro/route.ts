import { NextResponse } from 'next/server';
import { requireFinanceAccess } from '@/lib/finance/access';
import { loadWorkspace } from '@/services/finance.service';

/** GET: tudo da planilha da empresa (insumos, fichas, canais, despesas, configurações). */
export async function GET(request: Request) {
  const auth = await requireFinanceAccess(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    return NextResponse.json({ data: await loadWorkspace(auth.access) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao carregar.' }, { status: 500 });
  }
}
