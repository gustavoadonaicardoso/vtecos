/**
 * ============================================================
 * VTEC OS — Avisos de status do sistema (server-only)
 * ============================================================
 * A Vórtice publica no Painel Master > Status: instabilidade,
 * manutenção programada ou informativo, para todas as empresas ou só
 * para as escolhidas. A faixa do topo recebe daqui só o que a empresa
 * de quem está logado deve ver:
 *   - avisos em andamento;
 *   - manutenção que começa nas próximas 72 horas;
 *   - avisos encerrados nas últimas 2 horas (em verde).
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import {
  HEALTH_CHECKS,
  MAINTENANCE_HEADS_UP_HOURS,
  RESOLVED_VISIBLE_HOURS,
  STATUS_SERVICES,
  type NoticeAudience,
  type NoticeKind,
  type NoticePhase,
  type NoticeUpdate,
  type SystemNotice,
  type VisibleNotice,
} from '@/lib/status/types';

type Row = Record<string, unknown>;
type Failure = { error: string };
const KINDS: NoticeKind[] = ['incident', 'maintenance', 'info'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3_600_000;

function phaseOf(row: Row, now = Date.now()): NoticePhase {
  if (row.resolved_at) return 'resolved';
  // Manutenção e informativo acabam sozinhos no horário marcado.
  if (row.kind !== 'incident' && row.ends_at && new Date(String(row.ends_at)).getTime() <= now) return 'resolved';
  return new Date(String(row.starts_at)).getTime() > now ? 'scheduled' : 'active';
}

/** Quando terminou (encerrado à mão ou manutenção que passou do horário). */
function endedAt(row: Row): string | null {
  if (row.resolved_at) return String(row.resolved_at);
  if (row.kind !== 'incident' && row.ends_at && new Date(String(row.ends_at)).getTime() <= Date.now()) return String(row.ends_at);
  return null;
}

const updatesOf = (row: Row): NoticeUpdate[] => (Array.isArray(row.updates) ? (row.updates as NoticeUpdate[]) : []);

const toNotice = (row: Row): SystemNotice => ({
  id: String(row.id),
  kind: (KINDS.includes(row.kind as NoticeKind) ? row.kind : 'info') as NoticeKind,
  title: String(row.title || ''),
  message: String(row.message || ''),
  services: Array.isArray(row.services) ? (row.services as string[]) : [],
  audience: row.audience === 'tenants' ? 'tenants' : 'all',
  targetTenants: Array.isArray(row.target_tenants) ? (row.target_tenants as string[]) : [],
  startsAt: String(row.starts_at),
  endsAt: (row.ends_at as string) || null,
  resolvedAt: endedAt(row),
  updates: updatesOf(row),
  healthService: (row.health_service as string) || null,
  phase: phaseOf(row),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

/** Painel Master: abertos e os encerrados dos últimos 60 dias. */
export async function listNotices(): Promise<SystemNotice[]> {
  const since = new Date(Date.now() - 60 * 24 * HOUR).toISOString();
  const { data, error } = await db
    .from('system_notices')
    .select('*')
    .or(`resolved_at.is.null,resolved_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const order: Record<NoticePhase, number> = { active: 0, scheduled: 1, resolved: 2 };
  return ((data || []) as Row[]).map(toNotice).sort((a, b) => order[a.phase] - order[b.phase]);
}

/** Faixa do topo: o que esta empresa vê agora. */
export async function noticesFor(viewer: { tenantId: string }): Promise<VisibleNotice[]> {
  const now = Date.now();
  const recent = new Date(now - RESOLVED_VISIBLE_HOURS * HOUR).toISOString();
  const { data, error } = await db
    .from('system_notices')
    .select('*')
    .or(`resolved_at.is.null,resolved_at.gte.${recent}`)
    .order('starts_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);

  return ((data || []) as Row[])
    .filter((row) => row.audience !== 'tenants' || (Array.isArray(row.target_tenants) && (row.target_tenants as string[]).includes(viewer.tenantId)))
    .filter((row) => {
      const phase = phaseOf(row, now);
      if (phase === 'active') return true;
      if (phase === 'scheduled') return row.kind === 'maintenance' && new Date(String(row.starts_at)).getTime() - now <= MAINTENANCE_HEADS_UP_HOURS * HOUR;
      const ended = endedAt(row);
      return Boolean(ended && now - new Date(ended).getTime() <= RESOLVED_VISIBLE_HOURS * HOUR);
    })
    .map((row) => {
      const notice = toNotice(row);
      const updates = notice.updates;
      return {
        id: notice.id,
        kind: notice.kind,
        title: notice.title,
        message: notice.message,
        services: notice.services,
        phase: notice.phase,
        startsAt: notice.startsAt,
        endsAt: notice.endsAt,
        resolvedAt: notice.resolvedAt,
        lastUpdate: updates.length ? updates[updates.length - 1] : null,
        version: `${notice.phase}:${notice.updatedAt}`,
      };
    })
    // Em andamento primeiro, depois programados, depois encerrados.
    .sort((a, b) => ({ active: 0, scheduled: 1, resolved: 2 })[a.phase] - ({ active: 0, scheduled: 1, resolved: 2 })[b.phase]);
}

function parseDate(value: unknown): string | null | undefined {
  if (value === null || value === '' || value === undefined) return null;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

async function validTenants(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  // tenant-scope: ok (confere se as empresas escolhidas existem)
  const { data } = await db.from('tenants').select('id').in('id', ids);
  return (data || []).map((row) => String(row.id));
}

/** Cria ou edita (sem mexer na linha do tempo). */
export async function saveNotice(id: string | null, input: Row, actor: { id: string }): Promise<SystemNotice | Failure> {
  const kind = input.kind as NoticeKind;
  if (!KINDS.includes(kind)) return { error: 'Escolha o tipo do aviso.' };
  const title = String(input.title || '').trim().slice(0, 120);
  if (title.length < 3) return { error: 'Escreva um título curto para o aviso.' };
  const message = String(input.message || '').trim().slice(0, 1000);
  const services = Array.isArray(input.services) ? [...new Set(input.services.map(String))].filter((key) => STATUS_SERVICES.some((item) => item.key === key)) : [];
  const audience: NoticeAudience = input.audience === 'tenants' ? 'tenants' : 'all';
  const requested = Array.isArray(input.targetTenants) ? [...new Set(input.targetTenants.map(String))].filter((value) => UUID.test(value)).slice(0, 500) : [];
  const targetTenants = audience === 'tenants' ? await validTenants(requested) : [];
  if (audience === 'tenants' && targetTenants.length === 0) return { error: 'Escolha pelo menos uma empresa.' };

  const startsAt = parseDate(input.startsAt);
  const endsAt = parseDate(input.endsAt);
  if (startsAt === undefined || endsAt === undefined) return { error: 'Data ou hora inválida.' };
  const start = startsAt || new Date().toISOString();
  if (kind === 'maintenance' && (!startsAt || !endsAt)) return { error: 'Manutenção precisa de início e fim.' };
  // Instabilidade termina quando alguém encerra, não por horário.
  const end = kind === 'incident' ? null : endsAt;
  if (end && new Date(end).getTime() <= new Date(start).getTime()) return { error: 'O fim precisa ser depois do início.' };
  const healthService = typeof input.healthService === 'string' && HEALTH_CHECKS.some((check) => check.key === input.healthService) ? input.healthService : null;

  const now = new Date().toISOString();
  const fields = { kind, title, message, services, audience, target_tenants: targetTenants, starts_at: start, ends_at: end, updated_at: now };
  const query = id
    ? db.from('system_notices').update(fields).eq('id', id).select('*').maybeSingle()
    : db.from('system_notices').insert({ ...fields, health_service: healthService, created_by: actor.id }).select('*').single();
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data) return { error: 'Aviso não encontrado.' };
  return toNotice(data as Row);
}

async function loadRow(id: string): Promise<Row | null> {
  if (!UUID.test(id)) return null;
  const { data } = await db.from('system_notices').select('*').eq('id', id).maybeSingle();
  return (data as Row) || null;
}

/** Nova atualização na linha do tempo (ex.: "Identificamos a causa"). */
export async function addNoticeUpdate(id: string, messageRaw: unknown, actor: { name: string }): Promise<SystemNotice | Failure> {
  const row = await loadRow(id);
  if (!row) return { error: 'Aviso não encontrado.' };
  if (phaseOf(row) === 'resolved') return { error: 'Este aviso já foi encerrado.' };
  const message = String(messageRaw || '').trim().slice(0, 1000);
  if (!message) return { error: 'Escreva a atualização.' };
  const now = new Date().toISOString();
  const updates = [...updatesOf(row), { at: now, message, by: actor.name }].slice(-50);
  const { data, error } = await db.from('system_notices').update({ updates, updated_at: now }).eq('id', id).select('*').single();
  if (error) return { error: error.message };
  return toNotice(data as Row);
}

/** Encerra (resolvido / manutenção concluída), com mensagem final opcional. */
export async function resolveNotice(id: string, messageRaw: unknown, actor: { name: string }): Promise<SystemNotice | Failure> {
  const row = await loadRow(id);
  if (!row) return { error: 'Aviso não encontrado.' };
  if (row.resolved_at) return { error: 'Este aviso já foi encerrado.' };
  const now = new Date().toISOString();
  const message = String(messageRaw || '').trim().slice(0, 1000);
  const updates = message ? [...updatesOf(row), { at: now, message, by: actor.name }].slice(-50) : updatesOf(row);
  const { data, error } = await db.from('system_notices').update({ resolved_at: now, updates, updated_at: now }).eq('id', id).select('*').single();
  if (error) return { error: error.message };
  return toNotice(data as Row);
}

export async function deleteNotice(id: string): Promise<{ ok: true } | Failure> {
  if (!UUID.test(id)) return { error: 'Aviso não encontrado.' };
  const { error } = await db.from('system_notices').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true };
}
