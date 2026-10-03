import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '⚠️ Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias. ' +
    'Verifique o arquivo .env.local.'
  );
}

/**
 * Client do navegador. Usa o token da sessão do usuário (pego em
 * /api/auth/token) em toda consulta e no tempo real: o banco reconhece
 * quem é e o RLS devolve só os dados da empresa dele. Sem sessão (tela
 * de login, totem, painel), cai na chave pública, que não lê dados de
 * empresa nenhuma.
 */
let cached: { token: string; expiresAt: number } | null = null;
let pending: Promise<string | null> | null = null;

async function fetchSessionToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const now = Date.now() / 1000;
  if (cached && cached.expiresAt - now > 60) return cached.token;
  if (!pending) {
    pending = fetch('/api/auth/token', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          cached = null;
          return null;
        }
        const data = await response.json();
        cached = { token: data.access_token, expiresAt: data.expires_at || now + 300 };
        return cached.token;
      })
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Ao sair/entrar, esquece o token guardado. */
export function resetSupabaseSession() {
  cached = null;
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  accessToken: fetchSessionToken,
});
