/** Módulo E-mail: endereços, assunto, conversa, corpo, limpeza do HTML e servidores (sem banco e sem rede). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baseSubject, composeBodies, forwardSubject, formatAddress, messageIds, parseAddressList, replyAllRecipients,
  replyReferences, replySubject, snippetOf, textToHtml, threadKeyFor,
} from '@/lib/email/format';
import { sanitizeEmailHtml } from '@/lib/email/sanitize';
import { checkMailHost } from '@/lib/email/host-guard';
import { emailErrorMessage } from '@/lib/email/errors';
import { EMAIL_PRESETS, secureForPort } from '@/lib/email/presets';

test('endereços: vários formatos, inválidos e repetidos', () => {
  const { list, invalid } = parseAddressList('Ana Souza <ANA@x.com>, bia@y.com.br; "Lima, Carlos" <c@z.com>\nana@x.com, nao-e-email');
  assert.deepEqual(list.map((a) => a.address), ['ana@x.com', 'bia@y.com.br', 'c@z.com']);
  assert.equal(list[0].name, 'Ana Souza');
  assert.deepEqual(invalid, ['nao-e-email']);
  assert.equal(formatAddress({ name: 'Ana "A"', address: 'ana@x.com' }), `"Ana 'A'" <ana@x.com>`);
  assert.equal(formatAddress({ name: '', address: 'b@y.com' }), 'b@y.com');
});

test('assunto: Re:, Enc: sem repetir prefixos', () => {
  assert.equal(replySubject('Orçamento'), 'Re: Orçamento');
  assert.equal(replySubject('RES: Re: Fwd: Orçamento'), 'Re: Orçamento');
  assert.equal(forwardSubject('Re: Orçamento'), 'Enc: Orçamento');
  assert.equal(replySubject(''), 'Re: (sem assunto)');
  assert.equal(baseSubject('Re[2]: teste'), 'teste');
});

test('conversa: a resposta cai na conversa da original', () => {
  const original = threadKeyFor({ messageId: '<a@x>' });
  assert.equal(original, '<a@x>');
  assert.equal(threadKeyFor({ messageId: '<b@y>', inReplyTo: '<a@x>' }), '<a@x>');
  assert.equal(threadKeyFor({ messageId: '<c@z>', inReplyTo: '<b@y>', references: '<a@x> <b@y>' }), '<a@x>');
  assert.equal(threadKeyFor({ subject: 'Re: Oi' }), 'subject:oi');
  assert.deepEqual(messageIds('<a@x>  <b@y>'), ['<a@x>', '<b@y>']);
  assert.equal(replyReferences('<a@x>', '<b@y>'), '<a@x> <b@y>');
  assert.equal(replyReferences('<a@x>', '<a@x>'), '<a@x>');
});

test('responder a todos: sem a própria caixa e sem repetir', () => {
  const r = replyAllRecipients({
    from: { name: 'Cliente', address: 'cli@x.com' },
    to: [{ name: '', address: 'contato@empresa.com' }, { name: 'Bia', address: 'bia@x.com' }],
    cc: [{ name: '', address: 'cli@x.com' }, { name: '', address: 'chefe@x.com' }],
    own: 'Contato@Empresa.com',
  });
  assert.deepEqual(r.to.map((a) => a.address), ['cli@x.com']);
  assert.deepEqual(r.cc.map((a) => a.address), ['bia@x.com', 'chefe@x.com']);
  const viaReplyTo = replyAllRecipients({ from: { name: '', address: 'noreply@x.com' }, replyTo: 'atendimento@x.com', to: [], cc: [], own: 'a@b.com' });
  assert.equal(viaReplyTo.to[0].address, 'atendimento@x.com');
});

test('corpo: assinatura, citação e encaminhamento', () => {
  const quoted = { fromName: 'Cliente', fromAddress: 'cli@x.com', sentAt: '2026-10-12T15:00:00Z', bodyText: 'Linha 1\nLinha 2', subject: 'Pedido' };
  const reply = composeBodies({ body: 'Oi!', signature: 'Ana\nDoces', quoted, mode: 'reply' });
  assert.match(reply.text, /^Oi!\n\n-- \nAna\nDoces\n\nEm 12\/10\/2026[^\n]*Cliente <cli@x.com> escreveu:\n> Linha 1\n> Linha 2$/);
  assert.match(reply.html, /<blockquote/);
  const fwd = composeBodies({ body: 'Veja', quoted, mode: 'forward' });
  assert.match(fwd.text, /Mensagem encaminhada[\s\S]*De: Cliente <cli@x.com>[\s\S]*Assunto: Pedido[\s\S]*Linha 2/);
  assert.equal(textToHtml('<b>oi</b>\nhttps://x.com/a?b=1.'), '&lt;b&gt;oi&lt;/b&gt;<br><a href="https://x.com/a?b=1">https://x.com/a?b=1</a>.');
  assert.equal(snippetOf('  a\n\n b  '), 'a b');
  assert.equal(snippetOf('x'.repeat(200)).length, 160);
});

test('HTML recebido: tira scripts, eventos e formulários', () => {
  const dirty = '<p onclick="alert(1)">Oi<script>alert(1)</script></p><form><input></form><iframe src="https://mal.com"></iframe><a href="javascript:alert(1)">x</a><a href="https://ok.com">ok</a><img src="https://img.com/a.png" onerror="x()"><img src="data:image/png;base64,AAA">';
  const clean = sanitizeEmailHtml(dirty);
  assert.doesNotMatch(clean, /script|onclick|onerror|<form|<input|<iframe|javascript:/i);
  assert.match(clean, /<a href="https:\/\/ok.com" target="_blank" rel="noopener noreferrer">ok<\/a>/);
  assert.match(clean, /<img src="https:\/\/img.com\/a.png"/);
  assert.match(clean, /src="data:image\/png;base64,AAA"/);
});

test('servidores: só da internet, e erros em português', async () => {
  delete process.env.EMAIL_ALLOW_PRIVATE_HOSTS;
  for (const host of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.16.0.1', '169.254.169.254', '::1']) {
    assert.match(String(await checkMailHost(host)), /não é um endereço da internet/, host);
  }
  assert.match(String(await checkMailHost('servidor com espaço')), /inválido/);
  assert.equal(await checkMailHost('8.8.8.8'), null);
  assert.match(emailErrorMessage({ authenticationFailed: true }, 'imap'), /recusou usuário ou senha/);
  assert.match(emailErrorMessage({ code: 'ENOTFOUND' }, 'smtp'), /de saída.*não encontrado/);
  assert.equal(secureForPort(993), true);
  assert.equal(secureForPort(587), false);
  assert.ok(EMAIL_PRESETS.every((p) => p.key === 'custom' || (p.imapHost && p.smtpHost)));
});
