import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { clearSessionCookies } from '@/lib/session';

// supabaseAdmin só pode aparecer em arquivos que rodam exclusivamente
// no servidor (rotas de API como esta, nunca em services/*.ts que
// também são importados por hooks/componentes client-side).
export async function POST() {
  try {
    const store = await cookies();
    const accessToken = store.get('vortice_at')?.value;

    if (accessToken) {
      const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, 'global');
      if (error) console.error('[Logout] Erro ao revogar sessão:', error);
    }

    await clearSessionCookies();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[Logout] Erro:', error);
    await clearSessionCookies();
    return NextResponse.json({ error: 'Erro ao fazer logoff' }, { status: 500 });
  }
}
