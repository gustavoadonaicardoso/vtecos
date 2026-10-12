/** Automações: variáveis, respostas e validação do fluxo (sem banco). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyContext, inBusinessHours, matchMenuOption, normalizeGraph, portsFor, renderTemplate, validateAnswer, validateFlow, DEFAULT_HOURS } from '@/lib/automations/flow';
import { renderMessageTemplate, unknownMessageVariables, usesAccessPassword } from '@/lib/message-variables';

const ctx = emptyContext({
  lead: { ...emptyContext().lead, name: 'Ana Souza', email: 'ana@x.com', extra: { accessEmail: 'acesso@x.com', city: 'Santos', state: 'SP' }, custom: { matricula: '123' }, access_password: 'Senha123' },
  company: { name: 'Doces da Ana', phone: '', website: '', address: '' },
  now: new Date('2026-03-05T15:00:00Z'), // 12h em São Paulo
});

test('variáveis nas mensagens', () => {
  assert.equal(renderTemplate('Oi {{lead.first_name}}, da {{empresa}}!', ctx), 'Oi Ana, da Doces da Ana!');
  assert.equal(renderTemplate('{{lead.phone|sem telefone}}', ctx), 'sem telefone');
  assert.equal(renderTemplate('{{lead.access_email}} / {{lead.access_password}}', ctx), 'acesso@x.com / Senha123');
  assert.equal(renderTemplate('{{campo.matricula}} {{lead.address}}', ctx), '123 Santos/SP');
  assert.equal(renderTemplate('{{saudacao}}', ctx), 'Boa tarde');
  assert.ok(usesAccessPassword('Sua senha: {{senha_acesso}}'));
  assert.ok(!usesAccessPassword('Oi {{nome}}'));
  assert.deepEqual(unknownMessageVariables('Oi {{nome}} {{nao_existe}}'), ['nao_existe']);
  assert.match(renderMessageTemplate('Oi {{nome}}', ctx), /^Oi Ana/);
});

test('respostas do contato', () => {
  assert.deepEqual(validateAnswer('email', ' Ana@X.com '), { ok: true, value: 'ana@x.com' });
  assert.deepEqual(validateAnswer('phone', '(11) 98888-7777'), { ok: true, value: '5511988887777' });
  assert.equal(validateAnswer('cpf', '529.982.247-25').ok, true);
  assert.equal(validateAnswer('cpf', '111.111.111-11').ok, false);
  assert.equal(validateAnswer('cnpj', '11.222.333/0001-81').ok, true);
  assert.deepEqual(validateAnswer('date', '5/3/2026'), { ok: true, value: '05/03/2026' });
  assert.equal(validateAnswer('date', '31/2/2026').ok, false);
  assert.deepEqual(validateAnswer('yesno', 'Sim!'), { ok: true, value: 'sim' });
  assert.deepEqual(validateAnswer('yesno', 'não quero'), { ok: true, value: 'não' });
  const options = [{ id: 'a', label: 'Financeiro' }, { id: 'b', label: 'Suporte', keywords: 'ajuda, problema' }];
  assert.equal(matchMenuOption(options, '2')?.id, 'b');
  assert.equal(matchMenuOption(options, 'financeiro')?.id, 'a');
  assert.equal(matchMenuOption(options, 'tenho um problema')?.id, 'b');
  assert.equal(matchMenuOption(options, '9'), null);
});

test('horário comercial em São Paulo', () => {
  assert.equal(inBusinessHours(DEFAULT_HOURS, new Date('2026-03-05T15:00:00Z')), true); // quinta 12h
  assert.equal(inBusinessHours(DEFAULT_HOURS, new Date('2026-03-05T23:00:00Z')), false); // quinta 20h
  assert.equal(inBusinessHours(DEFAULT_HOURS, new Date('2026-03-08T15:00:00Z')), false); // domingo
});

test('validação do fluxo antes de ativar', () => {
  assert.match(validateFlow(normalizeGraph({ nodes: [] })).errors.join(' '), /gatilho/);
  const graph = normalizeGraph({
    nodes: [
      { id: 't', type: 'trigger-message', config: { matchMode: 'any' } },
      { id: 'm', type: 'send-message', config: { message: 'Oi {{lead.first_name}}' } },
      { id: 'solto', type: 'send-message', config: { message: 'Nunca roda' } },
    ],
    connections: [{ fromId: 't', toId: 'm' }, { fromId: 'm', toId: 't' }],
  });
  assert.equal(graph.connections.length, 1, 'não liga nada de volta ao gatilho');
  const result = validateFlow(graph);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes('nunca vai rodar')));
});

test('bloco Enviar e-mail', () => {
  const build = (config: Record<string, unknown>) => normalizeGraph({
    nodes: [
      { id: 't', type: 'trigger-lead', config: {} },
      { id: 'e', type: 'send-email', config },
    ],
    connections: [{ fromId: 't', toId: 'e' }],
  });
  const empty = build({});
  const node = empty.nodes.find((item) => item.id === 'e')!;
  assert.equal(node.config.emailTo, '{{lead.email}}', 'vai para o e-mail do lead por padrão');
  assert.deepEqual(portsFor(node).map((port) => port.id), ['default', 'no']);
  assert.match(validateFlow(empty).errors.join(' '), /caixa/i, 'pede a caixa de e-mail');
  const ok = build({ emailAccountId: '0b6f3c1e-8d7a-4f1e-9a51-1c2d3e4f5a6b', emailTo: '{{lead.email}}', emailSubject: 'Oi', message: 'Bem-vindo, {{lead.first_name}}' });
  assert.deepEqual(validateFlow(ok).errors, []);
  assert.match(validateFlow(build({ emailAccountId: '0b6f3c1e-8d7a-4f1e-9a51-1c2d3e4f5a6b', emailTo: '', emailSubject: 'Oi', message: 'x' })).errors.join(' '), /para quem/i);
});
