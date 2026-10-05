import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/session';
import { endSupportAccess, startSupportAccess } from '@/services/support-access.service';

/**
 * Modo suporte: admin da Vórtice entra numa empresa cliente (POST) e sai
 * (DELETE). Usa sempre o perfil DE VERDADE da sessão -- nunca o perfil
 * "dentro" da empresa do cliente.
 */
export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const result = await startSupportAccess(session.realProfile, body?.tenantId, body?.reason);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result }, { status: 201 });
}

export async function DELETE() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });

  const result = await endSupportAccess(session.realProfile);
  return NextResponse.json({ data: result });
}
