import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    '⚠️ Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias para o client administrativo (server-only). ' +
    'Verifique o arquivo .env.local.'
  );
}

/**
 * Client com a service role key — bypassa RLS. Uso exclusivo em código
 * que roda no servidor (Route Handlers, webhooks). Nunca importar em
 * componentes client-side.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
