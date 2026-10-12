/** Item "Backup diário do banco" do Painel Master > Status (lê o status.json do scripts/backup-db.sh). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupHealth } from '@/lib/status/backup';

const now = new Date('2026-10-12T12:00:00Z');
const status = (fields: Record<string, unknown>) => JSON.stringify({ ok: true, at: '2026-10-12T06:17:00Z', lastOkAt: '2026-10-12T06:17:00Z', lastOkBytes: 12_900_000, count: 14, error: null, ...fields });

test('backup bom e recente: ok, com data e tamanho', () => {
  const result = backupHealth(status({}), now, true);
  assert.equal(result.status, 'ok');
  assert.match(result.message, /12\/10 às 03:17/); // horário de São Paulo
  assert.match(result.message, /12,3 MB/);
  assert.match(result.message, /14 guardado/);
});

test('backup falhou: fora, com o erro e o último bom', () => {
  const result = backupHealth(status({ ok: false, at: '2026-10-12T06:17:00Z', lastOkAt: '2026-10-11T06:17:00Z', error: 'pg_dump falhou: senha errada' }), now, true);
  assert.equal(result.status, 'down');
  assert.match(result.message, /senha errada/);
  assert.match(result.message, /Último bom: 11\/10/);
});

test('cron parado: sem backup há mais de 26 horas', () => {
  const result = backupHealth(status({ lastOkAt: '2026-10-11T06:00:00Z' }), now, true);
  assert.equal(result.status, 'down');
  assert.match(result.message, /Sem backup há 30 horas/);
});

test('sem status.json: desligado se não configurado, fora se configurado', () => {
  assert.equal(backupHealth(null, now, false).status, 'off');
  const pending = backupHealth(null, now, true);
  assert.equal(pending.status, 'down');
  assert.match(pending.message, /backup\.sh instalar/);
  assert.equal(backupHealth('{quebrado', now, true).status, 'down');
});
