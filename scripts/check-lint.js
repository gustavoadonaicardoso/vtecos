#!/usr/bin/env node
/**
 * ============================================================
 * VÓRTICE CRM — Lint sem erros novos
 * ============================================================
 * O projeto tem erros de lint antigos (lista em scripts/lint-baseline.json,
 * por arquivo e regra). Este script roda o ESLint e só falha quando um
 * arquivo passa a ter MAIS erros de uma regra do que tinha na lista --
 * ou seja, código novo não entra com erro, e o antigo pode ser
 * corrigido aos poucos.
 *
 * Uso:
 *   npm run check:lint              confere (sai com código 1 se piorou)
 *   npm run check:lint -- --update  regrava a lista com o estado atual
 *                                   (use depois de CORRIGIR erros antigos)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const baselineFile = path.join(__dirname, 'lint-baseline.json');
const update = process.argv.includes('--update');

const eslintBin = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const run = spawnSync(process.execPath, [eslintBin, '.', '--format', 'json'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
let results;
try {
  results = JSON.parse(run.stdout);
} catch {
  console.error('Não foi possível rodar o ESLint:\n' + (run.stderr || run.stdout || '').slice(0, 4000));
  process.exit(2);
}

// { "src/arquivo.tsx": { "regra": quantidade } } -- só erros (avisos não contam).
const current = {};
const messages = {};
for (const file of results) {
  const rel = path.relative(root, file.filePath).split(path.sep).join('/');
  for (const message of file.messages) {
    if (message.severity !== 2) continue;
    const rule = message.ruleId || 'erro-de-sintaxe';
    current[rel] = current[rel] || {};
    current[rel][rule] = (current[rel][rule] || 0) + 1;
    (messages[`${rel}|${rule}`] = messages[`${rel}|${rule}`] || []).push(`${rel}:${message.line}:${message.column}  ${message.message}  (${rule})`);
  }
}

const total = (map) => Object.values(map).reduce((sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0), 0);

if (update) {
  const sorted = Object.fromEntries(Object.keys(current).sort().map((file) => [file, Object.fromEntries(Object.keys(current[file]).sort().map((rule) => [rule, current[file][rule]]))]));
  fs.writeFileSync(baselineFile, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Lista regravada: ${total(current)} erro(s) antigo(s) em ${Object.keys(current).length} arquivo(s).`);
  process.exit(0);
}

const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {};
const worse = [];
let fixed = 0;
for (const [file, rules] of Object.entries(current)) {
  for (const [rule, count] of Object.entries(rules)) {
    const allowed = baseline[file]?.[rule] || 0;
    if (count > allowed) worse.push({ file, rule, count, allowed });
  }
}
for (const [file, rules] of Object.entries(baseline)) {
  for (const [rule, allowed] of Object.entries(rules)) fixed += Math.max(0, allowed - (current[file]?.[rule] || 0));
}

if (worse.length) {
  console.error('Lint: erros NOVOS (corrija antes de mesclar):\n');
  for (const item of worse) {
    console.error(`${item.file} — ${item.rule}: ${item.count} (antes: ${item.allowed})`);
    for (const line of messages[`${item.file}|${item.rule}`].slice(0, 20)) console.error(`  ${line}`);
  }
  console.error('\nA conta é por arquivo e regra (mudar um erro antigo de linha não conta). Rode npm run check:lint para conferir antes de subir.');
  process.exit(1);
}

console.log(`OK: nenhum erro de lint novo (${total(current)} antigo(s) na lista${fixed ? `; ${fixed} já corrigido(s) -- rode npm run check:lint -- --update para baixar a lista` : ''}).`);
