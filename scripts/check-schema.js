#!/usr/bin/env node
/**
 * ============================================================
 * VÓRTICE CRM — Verificação de consistência do schema
 * ============================================================
 * Confere se todas as tabelas que o código espera realmente existem
 * no banco Supabase configurado. Isso pegou um problema real deste
 * projeto: 7 tabelas eram usadas pelo código mas nunca tinham sido
 * criadas em produção (ver supabase/migrations/202609210001_*.sql).
 *
 * Uso:
 *   npm run db:check-schema
 *
 * Requer no .env.local (ou no ambiente):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY como fallback)
 * ============================================================
 */

const { createClient } = require('@supabase/supabase-js');
const { loadEnvLocal } = require('./lib/load-env');

loadEnvLocal();

// Mantenha esta lista alinhada com supabase/migrations/*.sql sempre que
// uma tabela nova for criada ou removida.
const EXPECTED_TABLES = [
  'attendance_queue_tickets',
  'audit_logs',
  'blast_campaigns',
  'blast_contacts',
  'call_logs',
  'chat_group_members',
  'chat_group_messages',
  'chat_groups',
  'chat_messages',
  'google_calendar_connections',
  'google_calendar_event_links',
  'integrations_config',
  'internal_chat',
  'leads',
  'pipeline_stages',
  'platform_banners',
  'profiles',
  'queue_settings',
  'queue_tickets',
  'scheduled_messages',
  'scheduling_items',
  'system_config',
  'system_notifications',
  'system_updates',
];

const MISSING_TABLE_MARKERS = ['does not exist', '42P01', 'PGRST205', 'PGRST116'];

function looksLikeMissingTable(error) {
  if (!error) return false;
  const haystack = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase();
  return MISSING_TABLE_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()));
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    console.error(
      '❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY) são obrigatórias.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Verificando ${EXPECTED_TABLES.length} tabelas em ${supabaseUrl}...\n`);

  const missing = [];
  const otherErrors = [];

  for (const table of EXPECTED_TABLES) {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' });

    if (!error) {
      console.log(`  ✅ ${table}`);
      continue;
    }

    if (looksLikeMissingTable(error)) {
      console.log(`  ❌ ${table}  (tabela não existe)`);
      missing.push(table);
      continue;
    }

    // Erro diferente de "não existe" — provavelmente RLS bloqueando a key
    // usada. Reporta à parte, não conta como tabela ausente.
    console.log(`  ⚠️  ${table}  (${error.message})`);
    otherErrors.push({ table, message: error.message });
  }

  console.log('');

  if (missing.length === 0 && otherErrors.length === 0) {
    console.log('✅ Schema consistente — todas as tabelas esperadas existem.');
    return;
  }

  if (missing.length > 0) {
    console.log(`❌ ${missing.length} tabela(s) ausente(s): ${missing.join(', ')}`);
    console.log('   Rode as migrations em supabase/migrations/ no SQL Editor do Supabase.');
  }

  if (otherErrors.length > 0) {
    console.log(
      `⚠️  ${otherErrors.length} tabela(s) retornaram erro diferente de "não existe" — confira RLS/permissões.`
    );
  }

  process.exit(missing.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Erro inesperado:', err.message || err);
  process.exit(1);
});
