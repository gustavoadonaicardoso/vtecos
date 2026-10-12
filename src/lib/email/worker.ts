/**
 * ============================================================
 * VTEC OS — E-mail: busca os e-mails novos de todas as caixas
 * ============================================================
 * Ligado em src/instrumentation.ts (só em produção, com
 * CONTENT_SCHEDULER_ENABLED=true). A cada 2 minutos passa pelas caixas
 * ativas das empresas que têm o módulo E-mail no plano, 3 por vez.
 * Caixa com erro (senha trocada, servidor fora) tenta de novo a cada
 * 15 minutos; o dono foi avisado no sino quando ela parou.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { beat } from '@/lib/heartbeat';
import { tenantHasModule } from '@/lib/plan-limits';
import { syncAccount } from '@/services/email.service';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TICK_MS = 2 * 60_000;
const ERROR_RETRY_MS = 15 * 60_000;
const PARALLEL = 3;

async function runOnce() {
  // tenant-scope: ok (agendador de todas as empresas; cada caixa leva o próprio tenant_id)
  const { data, error } = await db.from('email_accounts').select('*').in('status', ['active', 'error']).order('last_sync_at', { ascending: true, nullsFirst: true }).limit(200);
  if (error) throw new Error(error.message);
  const now = Date.now();
  const due: Row[] = [];
  const allowed = new Map<string, boolean>();
  for (const account of (data || []) as Row[]) {
    if (account.status === 'error' && account.last_sync_at && now - Date.parse(account.last_sync_at) < ERROR_RETRY_MS) continue;
    const tenantId = String(account.tenant_id);
    if (!allowed.has(tenantId)) allowed.set(tenantId, await tenantHasModule(tenantId, 'email').catch(() => false));
    if (allowed.get(tenantId)) due.push(account);
  }
  for (let i = 0; i < due.length; i += PARALLEL) {
    await Promise.all(due.slice(i, i + PARALLEL).map((account) => syncAccount(account).catch((err) => console.error('[email] falha ao sincronizar', account.id, err instanceof Error ? err.message : err))));
  }
}

type LoopState = { timer: ReturnType<typeof setInterval> | null; running: boolean };
const holder = globalThis as typeof globalThis & { __vtecEmailWorker?: LoopState };
const loop = holder.__vtecEmailWorker ?? { timer: null, running: false };
holder.__vtecEmailWorker = loop;

export function startEmailWorker() {
  if (loop.timer) return;
  const run = async () => {
    if (loop.running) return;
    loop.running = true;
    try {
      await runOnce();
      beat('email');
    } catch (error) {
      beat('email', error);
      console.error('[email] erro na rodada:', error);
    } finally {
      loop.running = false;
    }
  };
  loop.timer = setInterval(() => void run(), TICK_MS);
  console.log('[email] sincronização das caixas ligada (a cada 2 min)');
  setTimeout(() => void run(), 30_000);
}
