import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthenticatedProfile } from '@/lib/session';

/**
 * Antes: o corpo da requisição dizia quem fez a ação (`user`), e o
 * servidor só gravava -- qualquer um podia forjar um log dizendo que
 * "o admin X fez Y". Agora a identidade vem sempre da sessão.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, details, entityType, entityId } = body;

    const profile = await getAuthenticatedProfile();
    const user = profile ? { id: profile.id, name: profile.name } : null;

    await logAudit(user, action, details, entityType, entityId, supabaseAdmin);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao registrar auditoria.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
