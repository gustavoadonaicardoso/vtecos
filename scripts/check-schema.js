#!/usr/bin/env node
/**
 * ============================================================
 * VÓRTICE CRM — Conferência do banco (Supabase) contra o código
 * ============================================================
 * Descobre sozinho o que o sistema precisa e confere se existe no banco:
 *   - tabelas: toda `.from('tabela')` do código em src/;
 *   - colunas: as criadas pelas migrations (create table e
 *     `add column`) dessas tabelas, menos as que migrations depois
 *     apagaram ou renomearam;
 *   - buckets do Storage: todo `.storage.from('bucket')` do código.
 * Para cada coisa que falta, diz qual migration cria -- e no fim a lista
 * de migrations para rodar no SQL Editor, na ordem.
 *
 * Uso (na pasta do projeto, com o .env.local de produção):
 *   npm run db:check-schema              confere o banco
 *   npm run db:check-schema -- --list    só mostra o que seria conferido
 *   npm run db:check-schema -- --verbose mostra também o que está ok
 *
 * Requer no .env.local (ou no ambiente):
 *   NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 * Só lê: não grava nada no banco.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { loadEnvLocal } = require('./lib/load-env');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const BASE_SCHEMA = path.join(ROOT, 'supabase', 'base-schema.sql');
const BASE_LABEL = 'supabase/base-schema.sql';

const args = new Set(process.argv.slice(2));
const LIST_ONLY = args.has('--list');
const VERBOSE = args.has('--verbose');

// ── 1. O que o código usa ────────────────────────────────────

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function scanCode() {
  const tables = new Map(); // tabela -> arquivos que usam
  const buckets = new Map();
  const add = (map, key, file) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(path.relative(ROOT, file));
  };
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    // Constantes do arquivo: const BUCKET = 'avatars';
    const constants = new Map();
    for (const item of text.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(['"`])([a-z0-9_-]+)\2/g)) constants.set(item[1], item[3]);

    const regex = /\.from\(\s*(?:(['"`])([a-z0-9_-]+)\1|([A-Z_][A-Z0-9_]*))\s*\)/g;
    let match;
    while ((match = regex.exec(text))) {
      const name = match[2] || constants.get(match[3]);
      if (!name) continue;
      // `.storage.from('x')` (às vezes quebrado em linhas) é bucket, não tabela.
      const before = text.slice(Math.max(0, match.index - 40), match.index);
      if (/storage\s*$/.test(before)) add(buckets, name, file);
      else if (/^[a-z_][a-z0-9_]*$/.test(name)) add(tables, name, file);
    }
  }
  return { tables, buckets };
}

// ── 2. O que as migrations criam ─────────────────────────────

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

/** Corpo entre parênteses a partir de `start` (que aponta para o "("). */
function parenBody(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return '';
}

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !quoted) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const NOT_COLUMNS = new Set(['constraint', 'primary', 'unique', 'foreign', 'check', 'exclude', 'like']);
const ident = (name) => name.replace(/"/g, '').toLowerCase();

function readSchemaHistory() {
  const files = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  const sources = [];
  if (fs.existsSync(BASE_SCHEMA)) sources.push({ label: BASE_LABEL, file: BASE_SCHEMA });
  for (const name of files) sources.push({ label: `supabase/migrations/${name}`, file: path.join(MIGRATIONS, name) });

  const tables = new Map(); // tabela -> migration que cria
  const columns = new Map(); // "tabela.coluna" -> migration que cria
  const buckets = new Map();
  const T = String.raw`(?:public\.)?("?[a-z_][a-z0-9_]*"?)`;

  for (const { label, file } of sources) {
    const sql = stripComments(fs.readFileSync(file, 'utf8'));
    // Na ordem em que aparecem no arquivo.
    const statement = new RegExp(
      String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${T}\s*\(|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${T}([^;]*);|drop\s+table\s+(?:if\s+exists\s+)?([^;]+);|insert\s+into\s+storage\.buckets[^;]*?values\s*\(\s*'([a-z0-9_-]+)'[^;]*;`,
      'gi',
    );
    let match;
    while ((match = statement.exec(sql))) {
      if (match[1]) {
        const table = ident(match[1]);
        if (!tables.has(table) || tables.get(table) === BASE_LABEL) tables.set(table, label);
        const body = parenBody(sql, match.index + match[0].length - 1);
        for (const part of splitTopLevel(body)) {
          const first = part.trim().split(/\s+/)[0];
          if (!first || NOT_COLUMNS.has(first.toLowerCase()) || !/^"?[a-z_][a-z0-9_]*"?$/i.test(first)) continue;
          const key = `${table}.${ident(first)}`;
          if (!columns.has(key) || columns.get(key) === BASE_LABEL) columns.set(key, label);
        }
      } else if (match[2]) {
        const table = ident(match[2]);
        const body = match[3] || '';
        const renameTable = body.match(/^\s*rename\s+to\s+("?\w+"?)/i);
        if (renameTable) {
          const to = ident(renameTable[1]);
          if (tables.has(table)) tables.set(to, tables.get(table));
          tables.delete(table);
          for (const [key, from] of [...columns]) {
            if (key.startsWith(`${table}.`)) {
              columns.delete(key);
              columns.set(`${to}.${key.slice(table.length + 1)}`, from);
            }
          }
          continue;
        }
        for (const add of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?("?\w+"?)/gi)) {
          const key = `${table}.${ident(add[1])}`;
          if (!columns.has(key) || columns.get(key) === BASE_LABEL) columns.set(key, label);
        }
        for (const drop of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?("?\w+"?)/gi)) columns.delete(`${table}.${ident(drop[1])}`);
        for (const rename of body.matchAll(/rename\s+column\s+("?\w+"?)\s+to\s+("?\w+"?)/gi)) {
          const from = `${table}.${ident(rename[1])}`;
          if (columns.has(from)) {
            columns.set(`${table}.${ident(rename[2])}`, label);
            columns.delete(from);
          }
        }
      } else if (match[4]) {
        for (const raw of match[4].replace(/\s+(cascade|restrict)\s*$/i, '').split(',')) {
          const table = ident(raw.trim().replace(/^public\./i, ''));
          tables.delete(table);
          for (const key of [...columns.keys()]) if (key.startsWith(`${table}.`)) columns.delete(key);
        }
      } else if (match[5]) {
        if (!buckets.has(match[5])) buckets.set(match[5], { label, sql: match[0].trim() });
      }
    }
  }
  return { tables, columns, buckets };
}

// ── 3. Conferência no banco ──────────────────────────────────

const MISSING_TABLE = /PGRST205|42P01|does not exist|could not find the table/i;
const MISSING_COLUMN = /42703|PGRST204|column .* does not exist|could not find the .* column/i;

async function main() {
  const code = scanCode();
  const history = readSchemaHistory();

  const tables = [...code.tables.keys()].sort();
  const columnChecks = new Map(); // tabela -> [{ column, from }]
  for (const [key, from] of history.columns) {
    const [table, column] = key.split('.');
    // Só tabelas que o código usa; o esquema inicial nem sempre bate com bancos antigos.
    if (!code.tables.has(table) || from === BASE_LABEL) continue;
    if (!columnChecks.has(table)) columnChecks.set(table, []);
    columnChecks.get(table).push({ column, from });
  }
  const buckets = [...code.buckets.keys()].sort();
  const totalColumns = [...columnChecks.values()].reduce((sum, list) => sum + list.length, 0);

  if (LIST_ONLY) {
    console.log(`Tabelas usadas pelo código (${tables.length}):`);
    for (const table of tables) {
      const from = history.tables.get(table);
      console.log(`  ${table.padEnd(32)} ${from || '⚠️  nenhuma migration cria esta tabela'}`);
    }
    console.log(`\nColunas criadas por migrations nessas tabelas: ${totalColumns}`);
    if (VERBOSE) {
      for (const [table, list] of [...columnChecks].sort()) {
        console.log(`  ${table}: ${list.map((item) => item.column).join(', ')}`);
      }
    }
    console.log(`\nBuckets do Storage usados pelo código (${buckets.length}):`);
    for (const bucket of buckets) console.log(`  ${bucket.padEnd(32)} ${history.buckets.get(bucket)?.label || '⚠️  nenhuma migration cria este bucket'}`);
    return;
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ Preciso de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local (rode na pasta do projeto).');
    process.exit(1);
  }

  const { createClient } = require('@supabase/supabase-js');
  // Cada consulta desiste em 20 s (internet ruim não deixa o script travado).
  const fetchWithTimeout = (input, init = {}) => fetch(input, { ...init, signal: init.signal || AbortSignal.timeout(20_000) });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetchWithTimeout } });
  let host = url;
  try { host = new URL(url).host; } catch {}
  console.log(`Conferindo o banco ${host}`);
  console.log(`  ${tables.length} tabelas, ${totalColumns} colunas e ${buckets.length} bucket(s) que o sistema usa.\n`);

  const missingTables = [];
  const missingColumns = [];
  const missingBuckets = [];
  const warnings = [];

  for (const table of tables) {
    // GET sem linhas (HEAD não traz a mensagem de erro).
    const { error } = await db.from(table).select('*').limit(0);
    if (error && MISSING_TABLE.test(`${error.code} ${error.message}`)) {
      missingTables.push(table);
      continue;
    }
    if (error) {
      warnings.push(`${table}: ${error.message}`);
      continue;
    }
    if (VERBOSE) console.log(`  ✅ ${table}`);

    const checks = columnChecks.get(table) || [];
    if (checks.length === 0) continue;
    // Uma consulta com todas; se faltar alguma, confere uma a uma.
    const all = await db.from(table).select(checks.map((item) => item.column).join(',')).limit(0);
    if (!all.error) continue;
    for (const item of checks) {
      const one = await db.from(table).select(item.column).limit(0);
      if (one.error && MISSING_COLUMN.test(`${one.error.code} ${one.error.message}`)) missingColumns.push({ table, ...item });
      else if (one.error) warnings.push(`${table}.${item.column}: ${one.error.message}`);
    }
  }

  if (buckets.length) {
    const { data, error } = await db.storage.listBuckets();
    if (error) warnings.push(`Storage: ${error.message}`);
    else {
      const existing = new Set((data || []).map((bucket) => bucket.id || bucket.name));
      for (const bucket of buckets) if (!existing.has(bucket)) missingBuckets.push(bucket);
    }
  }

  // ── Relatório ──
  const toRun = new Set();
  const noMigration = [];
  const origin = (from) => (from && from !== BASE_LABEL ? from : null);

  if (missingTables.length) {
    console.log(`❌ Faltam ${missingTables.length} tabela(s):`);
    for (const table of missingTables) {
      const from = origin(history.tables.get(table));
      if (from) toRun.add(from);
      else noMigration.push(`tabela ${table}`);
      const used = [...code.tables.get(table)].slice(0, 2).join(', ');
      console.log(`   - ${table}  →  ${from || (history.tables.get(table) === BASE_LABEL ? 'só no esquema inicial' : 'nenhuma migration cria')}  (usada em ${used})`);
    }
    console.log('');
  }
  if (missingColumns.length) {
    console.log(`❌ Faltam ${missingColumns.length} coluna(s):`);
    for (const item of missingColumns) {
      toRun.add(item.from);
      console.log(`   - ${item.table}.${item.column}  →  ${item.from}`);
    }
    console.log('');
  }
  const bucketSql = [];
  if (missingBuckets.length) {
    console.log(`❌ Faltam ${missingBuckets.length} bucket(s) no Storage:`);
    for (const bucket of missingBuckets) {
      const found = history.buckets.get(bucket);
      if (found) bucketSql.push(found.sql);
      else noMigration.push(`bucket ${bucket}`);
      console.log(`   - ${bucket}  →  ${found ? found.label : 'nenhuma migration cria'}`);
    }
    console.log('');
  }
  if (warnings.length) {
    console.log(`⚠️  ${warnings.length} item(ns) deram outro erro (não conta como falta):`);
    for (const warning of warnings) console.log(`   - ${warning}`);
    console.log('');
  }

  const problems = missingTables.length + missingColumns.length + missingBuckets.length;
  if (!problems) {
    console.log('✅ Banco em dia: tudo o que o sistema usa existe.');
    return;
  }
  if (toRun.size || bucketSql.length) console.log('O que fazer (no Supabase > SQL Editor), e depois rode esta conferência outra vez:');
  if (toRun.size) {
    console.log('\n• Rode estes arquivos inteiros, nesta ordem. Se algum der erro, pare e mande o erro para o Claude:');
    [...toRun].sort().forEach((file, index) => console.log(`   ${index + 1}. ${file}`));
  }
  if (bucketSql.length) {
    console.log('\n• Para criar os buckets que faltam, cole e rode:\n');
    for (const sql of bucketSql) console.log(sql.replace(/^/gm, '   ') + '\n');
  }
  if (noMigration.length) {
    console.log(`\nNenhuma migration do projeto cria: ${noMigration.join(', ')}. Mande este resultado para o Claude.`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error('❌ Erro inesperado:', error.message || error);
  process.exit(1);
});
