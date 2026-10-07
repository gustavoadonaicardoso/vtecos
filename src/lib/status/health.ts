/**
 * ============================================================
 * VTEC OS — Verificação automática dos serviços (server-only)
 * ============================================================
 * Roda a cada minuto na VPS (instrumentation.ts, mesma regra dos
 * agendadores). Confere banco, IA padrão, API da Meta e se os
 * agendadores continuam batendo. Duas falhas seguidas marcam o serviço
 * como fora e avisam a equipe da Vórtice no sino; quando volta, avisa
 * de novo. Nada é mostrado aos clientes sem alguém publicar o aviso no
 * Painel Master > Status.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { lastBeat } from '@/lib/heartbeat';
import { platformSettings } from '@/lib/platform-settings';
import { checkGeminiKey } from '@/lib/ai';
import { HEALTH_CHECKS, healthLabel, type HealthStatus, type ServiceHealth } from '@/lib/status/types';

type Result = { status: Exclude<HealthStatus, 'unknown'>; message: string | null; latencyMs: number | null };

/** Falhas seguidas até marcar como fora (evita alarme por um soluço). */
export const FAILS_TO_ALERT = 2;
/** Agendador sem bater por mais que isso está parado. */
const WORKER_MAX_SILENCE_MS = 10 * 60_000;
/** Logo depois de subir, o agendador ainda não bateu: não acusa. */
const STARTUP_GRACE_S = 180;
const WORKERS = ['automacoes', 'disparos', 'agendamento', 'redes', 'discador'];
/** Banco e agendadores a cada minuto; IA e Meta (serviços de fora) a cada 2. */
export const EXTERNAL_CHECKS = ['ia', 'meta'];

const workersEnabled = () => process.env.NODE_ENV === 'production' && process.env.CONTENT_SCHEDULER_ENABLED === 'true';

async function timed(run: () => Promise<Result>): Promise<Result> {
  const started = Date.now();
  try {
    const result = await Promise.race([
      run(),
      new Promise<Result>((resolve) => setTimeout(() => resolve({ status: 'down', message: 'Não respondeu em 15 segundos.', latencyMs: null }), 15_000)),
    ]);
    // Tempo de resposta só faz sentido quando respondeu.
    return { ...result, latencyMs: result.status === 'ok' ? result.latencyMs ?? Date.now() - started : null };
  } catch (error) {
    return { status: 'down', message: error instanceof Error ? error.message : 'Erro desconhecido.', latencyMs: null };
  }
}

async function checkDatabase(): Promise<Result> {
  // tenant-scope: ok (só confere se o banco responde)
  const { error } = await db.from('tenants').select('id').limit(1);
  return error ? { status: 'down', message: `O banco não respondeu: ${error.message}`, latencyMs: null } : { status: 'ok', message: null, latencyMs: null };
}

async function checkAi(): Promise<Result> {
  const settings = await platformSettings();
  if (settings.aiProvider === 'ollama') {
    try {
      const response = await fetch(`${settings.ollamaUrl.replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(8_000) });
      const json = await response.json().catch(() => ({}));
      const models: string[] = Array.isArray(json.models) ? json.models.map((model: { name?: string }) => String(model.name || '')) : [];
      if (!response.ok) return { status: 'down', message: `A IA local respondeu ${response.status}.`, latencyMs: null };
      if (!models.some((name) => name === settings.ollamaModel || name === `${settings.ollamaModel}:latest`)) {
        return { status: 'down', message: `O modelo ${settings.ollamaModel} não está baixado na IA local.`, latencyMs: null };
      }
      return { status: 'ok', message: null, latencyMs: null };
    } catch {
      return { status: 'down', message: `A IA local (${settings.ollamaUrl}) não respondeu.${settings.geminiKey ? ' O Gemini está respondendo no lugar.' : ''}`, latencyMs: null };
    }
  }
  if (!settings.geminiKey) return { status: 'off', message: 'Sem IA padrão configurada (Painel Master > Plataforma).', latencyMs: null };
  const checked = await checkGeminiKey(settings.geminiKey);
  return checked.ok ? { status: 'ok', message: null, latencyMs: null } : { status: 'down', message: checked.error, latencyMs: null };
}

async function checkMeta(): Promise<Result> {
  // Qualquer resposta HTTP abaixo de 500 = a API da Meta está no ar.
  const response = await fetch('https://graph.facebook.com/', { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response) return { status: 'down', message: 'Não foi possível falar com a API da Meta.', latencyMs: null };
  return response.status >= 500 ? { status: 'down', message: `A API da Meta respondeu ${response.status}.`, latencyMs: null } : { status: 'ok', message: null, latencyMs: null };
}

function checkWorker(key: string): Result {
  if (!workersEnabled()) return { status: 'off', message: 'Os agendadores não rodam neste servidor (só na VPS, com CONTENT_SCHEDULER_ENABLED=true).', latencyMs: null };
  const last = lastBeat(key);
  if (!last) {
    return process.uptime() < STARTUP_GRACE_S
      ? { status: 'ok', message: 'Iniciando.', latencyMs: null }
      : { status: 'down', message: 'O agendador não rodou desde que o servidor subiu.', latencyMs: null };
  }
  const silence = Date.now() - last.at;
  if (silence > WORKER_MAX_SILENCE_MS) return { status: 'down', message: `Parado há ${Math.round(silence / 60_000)} min.`, latencyMs: null };
  if (last.error) return { status: 'down', message: `O último ciclo falhou: ${last.error}`, latencyMs: null };
  return { status: 'ok', message: null, latencyMs: null };
}

async function runCheck(key: string): Promise<Result> {
  if (key === 'banco') return timed(checkDatabase);
  if (key === 'ia') return timed(checkAi);
  if (key === 'meta') return timed(checkMeta);
  return checkWorker(key);
}

const toHealth = (row: Record<string, unknown>): ServiceHealth => ({
  service: String(row.service),
  status: (row.status as HealthStatus) || 'unknown',
  message: (row.message as string) || null,
  latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
  since: String(row.since),
  checkedAt: String(row.checked_at),
});

/** Situação salva de cada serviço (o que ainda não foi verificado vem como "unknown"). */
export async function listHealth(): Promise<ServiceHealth[]> {
  const { data } = await db.from('platform_health').select('*');
  const rows = new Map(((data || []) as Record<string, unknown>[]).map((row) => [String(row.service), row]));
  return HEALTH_CHECKS.map((check) => {
    const row = rows.get(check.key);
    return row ? toHealth(row) : { service: check.key, status: 'unknown', message: null, latencyMs: null, since: new Date(0).toISOString(), checkedAt: new Date(0).toISOString() };
  });
}

async function platformAdmins(): Promise<string[]> {
  // tenant-scope: ok (avisos internos para a equipe da plataforma)
  const { data: platform } = await db.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  if (!platform?.id) return [];
  const { data } = await db.from('profiles').select('id').eq('tenant_id', platform.id).eq('status', 'ACTIVE').eq('role', 'ADMIN');
  return (data || []).map((row) => String(row.id));
}

async function bellTeam(title: string, content: string) {
  const ids = await platformAdmins();
  if (ids.length === 0) return;
  const { error } = await db.from('system_notifications').insert(
    ids.map((user_id) => ({ user_id, type: 'system', title, content: content.slice(0, 500), is_read: false, link: '/master?tab=status' }))
  );
  if (error) console.error('[status] Falha ao avisar no sino:', error.message);
}

async function openNoticeFor(service: string): Promise<string | null> {
  const { data } = await db.from('system_notices').select('title').eq('health_service', service).is('resolved_at', null).limit(1).maybeSingle();
  return (data?.title as string) || null;
}

const minutesSince = (iso: string) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

/**
 * Roda as verificações pedidas (todas, se nada for passado), grava o
 * resultado e avisa a equipe quando um serviço cai ou volta.
 */
export async function runHealthChecks(keys: string[] = HEALTH_CHECKS.map((check) => check.key)): Promise<ServiceHealth[]> {
  const now = new Date().toISOString();
  const previous = new Map((await listHealth()).map((item) => [item.service, item]));
  const { data: counts } = await db.from('platform_health').select('service, fail_count').in('service', keys);
  const failCount = new Map(((counts || []) as { service: string; fail_count: number }[]).map((row) => [row.service, Number(row.fail_count) || 0]));

  const results = await Promise.all(keys.map(async (key) => ({ key, result: await runCheck(key) })));
  for (const { key, result } of results) {
    const before = previous.get(key);
    const wasDown = before?.status === 'down';
    let status: HealthStatus = result.status;
    let fails = 0;
    if (result.status === 'down') {
      fails = (failCount.get(key) || 0) + 1;
      // Primeira falha: ainda conta como no ar (o que estava antes).
      if (!wasDown && fails < FAILS_TO_ALERT) status = before && before.status !== 'unknown' ? before.status : 'ok';
    }
    const changed = status !== before?.status;
    const row = {
      service: key,
      status,
      message: result.message,
      latency_ms: result.latencyMs,
      fail_count: fails,
      since: changed || !before ? now : before.since,
      checked_at: now,
    };
    const { error } = await db.from('platform_health').upsert(row, { onConflict: 'service' });
    if (error) {
      console.error('[status] Falha ao gravar a verificação:', error.message);
      continue;
    }

    if (status === 'down' && !wasDown) {
      await bellTeam(`Problema detectado: ${healthLabel(key)}`, `${result.message || 'Falhou na verificação automática.'} Se afetar os clientes, publique um aviso em Painel Master > Status.`);
    } else if (wasDown && status === 'ok' && before) {
      const notice = await openNoticeFor(key);
      await bellTeam(
        `Voltou ao normal: ${healthLabel(key)}`,
        `Ficou fora por cerca de ${minutesSince(before.since)} min.${notice ? ` O aviso "${notice}" continua aberto: encerre em Painel Master > Status.` : ''}`
      );
    }
  }
  return listHealth();
}

type LoopState = { timer: ReturnType<typeof setInterval> | null; running: boolean; ticks: number };
const holder = globalThis as typeof globalThis & { __vtecHealthCheck?: LoopState };
const loop = holder.__vtecHealthCheck ?? { timer: null, running: false, ticks: 0 };
holder.__vtecHealthCheck = loop;

export function startHealthChecks() {
  if (loop.timer) return;
  const run = async () => {
    if (loop.running) return;
    loop.running = true;
    try {
      const external = loop.ticks % 2 === 0;
      loop.ticks += 1;
      await runHealthChecks(['banco', ...WORKERS, ...(external ? EXTERNAL_CHECKS : [])]);
    } catch (error) {
      console.error('[status] erro na verificação:', error);
    } finally {
      loop.running = false;
    }
  };
  loop.timer = setInterval(() => void run(), 60_000);
  console.log('[status] verificação automática ligada (a cada 60s)');
  // Dá tempo dos agendadores rodarem o primeiro ciclo.
  setTimeout(() => void run(), 20_000);
}
