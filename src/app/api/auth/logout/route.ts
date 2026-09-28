import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { signOut } from '@/services/auth.service';
import { clearSessionCookies } from '@/lib/session';

export async function POST() {
  try {
    const store = await cookies();
    const accessToken = store.get('vortice_at')?.value;

    await signOut(accessToken);
    await clearSessionCookies();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    await clearSessionCookies();
    return NextResponse.json({ error: 'Erro ao fazer logoff' }, { status: 500 });
  }
}
