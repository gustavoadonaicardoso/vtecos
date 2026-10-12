/** Permissões, documentos e limite de tentativas (sem banco). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION_ITEMS, ROLE_DEFAULT_PERMISSIONS, profileHasPermission, routePermission, sanitizePermissions } from '@/lib/permissions.constants';
import { isValidCPF, validateBrazilDocument, validateBrazilPhone } from '@/lib/brazilian-fields';
import { clientIp, createLimiter } from '@/lib/rate-limit';

test('permissões: páginas internas herdam a da página principal', () => {
  assert.equal(routePermission('/master'), 'admin.root');
  assert.equal(routePermission('/master/qualquer/coisa'), 'admin.root');
  assert.equal(routePermission('/pagina-inexistente'), undefined);
});

test('permissões: quem pode o quê', () => {
  const seller = { role: 'SELLER', permissions: ROLE_DEFAULT_PERMISSIONS.SELLER };
  assert.equal(profileHasPermission({ role: 'ADMIN', permissions: {} }, 'admin.root'), true);
  assert.equal(profileHasPermission(seller, 'leads.view'), true);
  assert.equal(profileHasPermission(seller, 'admin.root'), false);
  assert.equal(profileHasPermission(seller, ['admin.root', 'leads.view']), true);
  assert.equal(profileHasPermission(null, 'leads.view'), false);
  const clean = sanitizePermissions({ leads: { view: true, hack: true }, lixo: { x: true } });
  assert.equal(clean.leads.view, true);
  assert.equal('hack' in clean.leads, false);
  assert.equal('lixo' in clean, false);
  // Todo item do catálogo tem id "categoria.campo".
  for (const item of PERMISSION_ITEMS) assert.equal(item.id, `${item.cat}.${item.field}`);
});

test('CPF, RG e telefone', () => {
  assert.equal(isValidCPF('529.982.247-25'), true);
  assert.equal(isValidCPF('529.982.247-26'), false);
  assert.equal(isValidCPF('000.000.000-00'), false);
  assert.equal(validateBrazilDocument('12.345.678-X'), null); // RG
  assert.equal(validateBrazilPhone('11988887777'), null);
  assert.ok(validateBrazilPhone('11888887777')); // celular sem o 9
  assert.ok(validateBrazilPhone('0198888777'));
});

test('limite de tentativas', () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 2 });
  assert.equal(limiter.blocked('ip').blocked, false);
  limiter.hit('ip');
  limiter.hit('ip');
  const state = limiter.blocked('ip');
  assert.equal(state.blocked, true);
  assert.ok(state.retryInMs > 0 && state.retryInMs <= 60_000);
  assert.equal(limiter.blocked('outro').blocked, false);
  limiter.reset('ip');
  assert.equal(limiter.blocked('ip').blocked, false);
  assert.equal(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })), '1.2.3.4');
});
