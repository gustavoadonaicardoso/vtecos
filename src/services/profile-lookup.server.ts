/**
 * Busca de perfil pelo servidor (service role). Depois da separação por
 * empresa, profiles não é mais legível pela chave pública -- então o
 * login e a verificação da sessão leem por aqui.
 * Só importar em código de servidor.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { UserProfile } from '@/types';

export async function fetchProfileById(userId: string): Promise<UserProfile | null> {
  // tenant-scope: ok (identifica quem está logado; a empresa vem desse perfil)
  const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    console.error('[ProfileLookup] fetchProfileById:', error.message);
    return null;
  }
  return (data as UserProfile) ?? null;
}

export async function fetchProfileByEmail(email: string): Promise<UserProfile | null> {
  // tenant-scope: ok (identifica quem está logado; a empresa vem desse perfil)
  const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (error) {
    console.error('[ProfileLookup] fetchProfileByEmail:', error.message);
    return null;
  }
  return (data as UserProfile) ?? null;
}
