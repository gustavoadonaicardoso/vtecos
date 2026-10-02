import { NextResponse } from 'next/server';
import { requireActiveProfile, requireAdminProfile } from '@/lib/session';
import { getSocialSettings, saveSocialSettings } from '@/services/social.service';

/** Qualquer usuário lê (o criador de post precisa das contas padrão e da regra de aprovação). */
export async function GET() {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  return NextResponse.json({ success: true, data: await getSocialSettings() });
}

export async function PUT(request: Request) {
  const auth = await requireAdminProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Configurações inválidas.' }, { status: 400 });
  }

  const result = await saveSocialSettings(body);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data });
}
