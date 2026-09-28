import { NextResponse } from 'next/server';
import { signOut } from '@/services/auth.service';
import { clearSessionCookies } from '@/lib/session';

export async function POST() {
  try {
    await signOut();
    await clearSessionCookies();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    await clearSessionCookies();
    return NextResponse.json({ error: 'Erro ao fazer logoff' }, { status: 500 });
  }
}
