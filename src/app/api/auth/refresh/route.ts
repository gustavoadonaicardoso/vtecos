import { NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/session';
import { withWorkspace } from '@/services/workspace.service';

/**
 * Antes: aceitava ?id=<qualquer-uuid> e devolvia o perfil completo sem
 * checar nada -- qualquer pessoa podia ler cargo/e-mail/telefone/
 * permissões de qualquer usuário. Agora a identidade vem só da sessão
 * (cookie httpOnly verificado contra o Supabase Auth); nunca do que o
 * cliente pede.
 */
export async function GET() {
  try {
    const profile = await getAuthenticatedProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
    }
    return NextResponse.json({ data: await withWorkspace(profile) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to refresh user' }, { status: 500 });
  }
}
