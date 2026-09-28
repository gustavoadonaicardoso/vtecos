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
 * Client dedicado só pra operações de auth no servidor (login, logout,
 * verificar/renovar token de sessão).
 *
 * O client de src/lib/supabase.ts é um singleton do módulo, compartilhado
 * por TODAS as requisições simultâneas do processo Node. Métodos como
 * `getUser()`/`refreshSession()`/`signInWithPassword()`/`signOut()`
 * mutam o estado interno do client (a sessão "atual" que ele guarda em
 * memória) -- usar o mesmo client pra isso sob concorrência (ex: várias
 * chamadas disparadas por um único refresh de página) fazia a sessão de
 * uma requisição vazar/atropelar a de outra, derrubando o usuário sem
 * motivo real. Este client isolado, sem persistSession/autoRefreshToken,
 * não guarda nenhum estado entre chamadas -- cada verificação é
 * independente, como deve ser num servidor que atende muitos usuários
 * ao mesmo tempo.
 */
export const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
