import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Entrega ao navegador o token de acesso do Supabase da sessão atual.
 * Com ele, as consultas e o tempo real feitos direto do navegador rodam
 * como o próprio usuário -- e o RLS do banco só devolve dados da empresa
 * dele. O refresh token continua só no cookie httpOnly.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session || session.profile.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Sem sessão.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    { access_token: session.accessToken, expires_at: session.expiresAt },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
