/**
 * Backup diário do banco: regra do item "Backup diário do banco" do
 * Painel Master > Status. Quem faz o backup é o scripts/backup-db.sh,
 * pelo cron da VPS; ele grava status.json e aqui só lemos o resultado.
 */

import path from 'path';

type BackupResult = { status: 'ok' | 'down' | 'off'; message: string; latencyMs: null };

/** Sem um backup bom há mais que isso, acusa (roda uma vez por dia). */
export const BACKUP_MAX_AGE_H = 26;

/** Pasta dos backups na VPS (scripts/backup-db.sh): ao lado da pasta do sistema. */
export const backupDir = () => process.env.BACKUP_DIR || path.join(process.cwd(), '..', 'vtec-os-backups');

const brDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Lê o status.json do backup diário (escrito pelo scripts/backup-db.sh na VPS). */
export function backupHealth(raw: string | null, now: Date, configured: boolean): BackupResult {
  if (raw === null) {
    return configured
      ? { status: 'down', message: 'Nenhum backup feito ainda. No Mac, rode: ./backup.sh instalar', latencyMs: null }
      : { status: 'off', message: 'Backup não configurado (README > Backup do banco).', latencyMs: null };
  }
  let status: { ok?: boolean; at?: string; error?: string | null; lastOkAt?: string | null; lastOkBytes?: number; count?: number };
  try {
    status = JSON.parse(raw);
  } catch {
    return { status: 'down', message: 'O status.json do backup está ilegível.', latencyMs: null };
  }
  const lastOk = status.lastOkAt ? Date.parse(status.lastOkAt) : NaN;
  const last = Number.isFinite(lastOk) ? `Último bom: ${brDateTime(status.lastOkAt!)}.` : 'Nenhum backup bom ainda.';
  if (!status.ok) return { status: 'down', message: `O último backup falhou: ${status.error || 'erro desconhecido'} ${last}`.slice(0, 500), latencyMs: null };
  if (!Number.isFinite(lastOk)) return { status: 'down', message: 'Nenhum backup bom ainda.', latencyMs: null };
  const hours = (now.getTime() - lastOk) / 3_600_000;
  if (hours > BACKUP_MAX_AGE_H) return { status: 'down', message: `Sem backup há ${Math.floor(hours)} horas (o cron da VPS parou?). ${last}`, latencyMs: null };
  return { status: 'ok', message: `Último backup: ${brDateTime(status.lastOkAt!)} · ${sizeLabel(Number(status.lastOkBytes) || 0)} · ${status.count || 1} guardado(s).`, latencyMs: null };
}

