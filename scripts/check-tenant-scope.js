#!/usr/bin/env node
/**
 * ============================================================
 * VÓRTICE CRM — Conferência da separação por empresa
 * ============================================================
 * No servidor, o client com service role ignora o RLS do banco. Então
 * toda consulta a uma tabela de empresa precisa filtrar/gravar
 * tenant_id explicitamente. Este script procura, nos arquivos do
 * servidor, chamadas `.from('<tabela de empresa>')` cuja cadeia não
 * menciona tenant_id -- cada uma é um vazamento em potencial.
 *
 * Uso: node scripts/check-tenant-scope.js   (sai com código 1 se achar)
 * Para uma exceção consciente, comente na linha anterior:
 *   // tenant-scope: ok (motivo)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const TENANT_TABLES = [
  'leads', 'pipeline_stages', 'chat_messages', 'message_templates', 'blast_campaigns', 'blast_contacts',
  'call_logs', 'scheduled_messages', 'scheduling_items', 'google_calendar_connections', 'google_calendar_event_links',
  'internal_chat', 'chat_groups', 'chat_group_members', 'chat_group_messages', 'goals', 'action_plans',
  'planning_boards', 'attendance_queue_tickets', 'attendance_queue_contacts', 'queue_settings', 'queue_display_media',
  'queue_tickets', 'system_updates', 'integrations_config', 'audit_logs', 'social_accounts', 'social_posts',
  'social_post_targets', 'profiles', 'fin_settings', 'fin_ingredients', 'fin_products', 'fin_product_items',
  'fin_fixed_costs', 'fin_channels', 'fin_sales',
];

const root = path.join(__dirname, '..', 'src');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
})(root);

const problems = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  // Código do navegador usa a sessão do usuário: o RLS do banco já filtra.
  if (/^['"]use client['"]/m.test(text.slice(0, 200))) continue;
  if (!/supabaseAdmin|supabase-admin/.test(text)) continue;

  const regex = /\.from\(\s*'([a-z_]+)'\s*\)/g;
  let match;
  while ((match = regex.exec(text))) {
    const table = match[1];
    if (!TENANT_TABLES.includes(table)) continue;
    const before = text.slice(0, match.index);
    const line = before.split('\n').length;
    const previousLines = before.split('\n').slice(-3).join('\n');
    if (/tenant-scope: ok/.test(previousLines)) continue;
    // A cadeia vai até o fim da instrução.
    const rest = text.slice(match.index);
    const end = rest.search(/;\s*\n|\n\s*\n/);
    const chain = rest.slice(0, end < 0 ? 600 : end);
    if (/tenant_id|tenantId|scoped\(/.test(chain)) continue;
    problems.push(`${path.relative(path.join(__dirname, '..'), file)}:${line}  ${table}`);
  }
}

if (problems.length) {
  console.log(`${problems.length} consulta(s) sem filtro de empresa:`);
  for (const problem of problems) console.log('  ' + problem);
  process.exit(1);
}
console.log('OK: todas as consultas de servidor filtram por empresa.');
