import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Batimento de presença: grava "visto por último" do usuário da sessão.
 * Chamado a cada minuto enquanto o sistema está aberto e, via
 * sendBeacon, quando a aba é fechada. O "Online" em tempo real em si
 * vem do Supabase Realtime Presence (PresenceContext).
 */
export async function POST() {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const lastSeenAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ last_seen_at: lastSeenAt })
    .eq('id', auth.profile.id);

  // Coluna ainda não criada (migration pendente): não quebra o app.
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  return NextResponse.json({ success: true, lastSeenAt });
}
