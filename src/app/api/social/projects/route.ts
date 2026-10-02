import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { listProjectOptions } from '@/services/social.service';

/**
 * Lista enxuta (id + nome) dos Projetos para vincular posts e contas.
 * A rota /api/projects devolve tudo e é restrita a quem gerencia projetos;
 * aqui qualquer usuário do módulo precisa poder escolher o projeto do post.
 */
export async function GET() {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const result = await listProjectOptions();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data });
}
