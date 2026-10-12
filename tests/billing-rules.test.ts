/**
 * Regras puras de cobrança, teste grátis e planos (sem banco).
 * Rodar: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueTrialStep, renderTrialMessage, TRIAL_MESSAGE_DEFAULTS, TRIAL_MESSAGE_ORDER } from '@/lib/trial-messages';
import { changeMode, cyclePrice } from '@/lib/plan-change';
import { homeRoute, isRouteAllowed, limitLabel, limitsOf, parseLimit, sanitizeModules } from '@/lib/plans';

test('lembretes do teste grátis: qual mensagem sai em cada dia', () => {
  assert.deepEqual(dueTrialStep(7, {}), { send: 'welcome', skip: [] });
  assert.deepEqual(dueTrialStep(6, { welcome: 'x' }), { send: null, skip: [] });
  assert.equal(dueTrialStep(5, { welcome: 'x' }).send, 'day3');
  assert.equal(dueTrialStep(3, { welcome: 'x', day3: 'x' }).send, 'day5');
  assert.equal(dueTrialStep(2, { welcome: 'x', day3: 'x', day5: 'x' }).send, 'day6');
  // Atrasado (servidor fora do ar): manda só a mais recente e pula as outras.
  assert.deepEqual(dueTrialStep(2, { welcome: 'x' }), { send: 'day6', skip: ['day3', 'day5'] });
  assert.equal(dueTrialStep(-1, {}).send, null);
});

test('lembretes do teste grátis: textos e variáveis', () => {
  for (const key of TRIAL_MESSAGE_ORDER) assert.ok(TRIAL_MESSAGE_DEFAULTS[key].trim(), `texto padrão de ${key}`);
  assert.equal(renderTrialMessage('Oi {nome}, {x} {empresa}', { nome: 'Ana', empresa: 'Doces' }), 'Oi Ana, {x} Doces');
});

test('troca de plano: preço do ciclo e quando vale', () => {
  assert.equal(cyclePrice(59, 'MONTHLY'), 59);
  assert.equal(cyclePrice(59.9, 'YEARLY'), 599); // anual = 10 meses
  assert.equal(changeMode('active', 119, 59), 'next_invoice'); // descer: na próxima fatura
  assert.equal(changeMode('active', 59, 119), 'now'); // subir: na hora
  assert.equal(changeMode('trial', 119, 59), 'now'); // no teste: sempre na hora
});

test('planos: módulos, páginas liberadas e limites', () => {
  assert.deepEqual(sanitizeModules(['financeiro', 'crm', 'crm', 'nao-existe', 3]), ['crm', 'financeiro']);
  assert.deepEqual(sanitizeModules('crm'), []);
  assert.equal(isRouteAllowed('/settings', []), true); // página base
  assert.equal(isRouteAllowed('/financeiro', ['crm']), false);
  assert.equal(isRouteAllowed('/financeiro', ['financeiro']), true);
  assert.equal(homeRoute([]), '/help');
  assert.equal(parseLimit(''), null);
  assert.equal(parseLimit('5.9'), 5);
  assert.equal(parseLimit(-1), null);
  assert.deepEqual(limitsOf({ max_users: '3', ai_monthly_limit: null }), { max_users: 3, ai_monthly_limit: null, blast_daily_limit: null });
  assert.equal(limitLabel('max_users', 1), 'Até 1 usuário');
  assert.equal(limitLabel('max_users', null), 'Sem limite');
  assert.equal(limitLabel('blast_daily_limit', 0), 'Não incluído');
});
