/** Campos extras dos leads e telefone (sem banco). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageOn, cleanCustomValue, cleanExtra, customFieldKey, formatAddress, generatePassword, parseDate } from '@/lib/lead-fields';
import { phoneKey } from '@/lib/lead-phone';

const value = (result: { value: string | null } | { error: string }) => ('error' in result ? `ERRO: ${result.error}` : result.value);

test('campos extras: limpeza e validação', () => {
  assert.equal(value(cleanExtra('accessEmail', ' Ana@Exemplo.COM ')), 'ana@exemplo.com');
  assert.match(value(cleanExtra('accessEmail', 'ana@')) || '', /^ERRO/);
  assert.equal(value(cleanExtra('cep', '01310100')), '01310-100');
  assert.match(value(cleanExtra('cep', '123')) || '', /^ERRO/);
  assert.equal(value(cleanExtra('state', 'sp')), 'SP');
  assert.equal(value(cleanExtra('instagram', 'https://www.instagram.com/doces.da.ana/?hl=pt')), '@doces.da.ana');
  assert.equal(value(cleanExtra('website', 'docesdaana.com.br')), 'https://docesdaana.com.br');
  assert.equal(value(cleanExtra('birthDate', '5/3/1990')), '1990-03-05');
  assert.match(value(cleanExtra('birthDate', '31/02/1990')) || '', /^ERRO/);
  assert.equal(value(cleanExtra('city', '   ')), null);
});

test('campos personalizados', () => {
  assert.equal(customFieldKey('Nº da matrícula'), 'n_da_matricula');
  assert.equal(value(cleanCustomValue({ key: 'v', label: 'Valor', type: 'number', position: 0 }, '1.234,5')), '1234.5');
  assert.match(value(cleanCustomValue({ key: 'v', label: 'Valor', type: 'number', position: 0 }, 'abc')) || '', /^ERRO/);
  assert.equal(value(cleanCustomValue({ key: 'd', label: 'Data', type: 'date', position: 1 }, '2026-01-31')), '2026-01-31');
  assert.equal(parseDate('2026-02-30'), null);
});

test('endereço, idade e senha gerada', () => {
  assert.equal(formatAddress({ street: 'Rua A', number: '10', complement: 'ap 2', district: 'Centro', city: 'Santos', state: 'SP', cep: '11010-000' }), 'Rua A, 10 - ap 2, Centro, Santos/SP, 11010-000');
  assert.equal(formatAddress({ city: 'Santos' }), 'Santos');
  const now = new Date('2026-03-05T15:00:00Z');
  assert.equal(ageOn('1990-03-05', now), '36');
  assert.equal(ageOn('1990-03-06', now), '35');
  assert.equal(ageOn(undefined, now), '');
  const password = generatePassword(12);
  assert.equal(password.length, 12);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[2-9]/);
  assert.doesNotMatch(password, /[01OIl]/); // sem letras parecidas
});

test('telefone: mesma chave em qualquer formato (evita lead duplicado)', () => {
  const key = phoneKey('11988887777');
  assert.equal(key, '88887777');
  for (const phone of ['+55 (11) 98888-7777', '5511988887777', '(11) 98888-7777', '988887777']) assert.equal(phoneKey(phone), key, phone);
  assert.equal(phoneKey(null), '');
});
