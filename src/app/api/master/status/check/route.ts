import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/session';
import { runHealthChecks } from '@/lib/status/health';

/** "Verificar agora": roda todas as verificações e devolve o resultado. */
export async function POST() {
  const auth = await requirePlatformAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  try {
    return NextResponse.json({ data: await runHealthChecks() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha na verificação.' }, { status: 500 });
  }
}
