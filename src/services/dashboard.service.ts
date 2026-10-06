/**
 * ============================================================
 * VÓRTICE CRM — Resumo do dashboard (todos os módulos)
 * ============================================================
 * Junta números de vários módulos numa chamada só. Cada bloco é
 * independente e tolerante: se a tabela de um módulo não existir ou a
 * consulta falhar, aquele bloco volta null e o resto do dashboard segue.
 * Leads/pipeline e metas não entram aqui -- o dashboard já recebe esses
 * dados pelo LeadContext e pela API de metas.
 * Server-only (supabaseAdmin).
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { UserProfile } from '@/types';

const DAY = 86_400_000;

function hasPermission(profile: UserProfile, path: string) {
  if (profile.role === 'ADMIN') return true;
  const permissions = profile.permissions as Record<string, Record<string, boolean>> | undefined;
  // Mesmo fallback do hook usePermissions: sem permissões configuradas, não trava.
  if (!permissions || Object.keys(permissions).length === 0) return true;
  const [category, field] = path.split('.');
  return permissions?.[category]?.[field] === true;
}

async function safe<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error('[dashboard] bloco ignorado:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** count exato sem trazer linhas -- sempre só da empresa informada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountQuery = any;

async function countIn(tenantId: string, table: string, apply: (query: CountQuery) => CountQuery = (query) => query): Promise<number> {
  // Notificações são por usuário (user_id), não têm tenant_id.
  const base = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
  const scoped = table === 'system_notifications' ? base : base.eq('tenant_id', tenantId);
  const { count: total, error } = await apply(scoped);
  if (error) throw new Error(`${table}: ${error.message}`);
  return total ?? 0;
}

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Dia da fila de senhas (fuso de São Paulo, igual ao banco). */
const queueDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
};

export interface DashboardSummary {
  social: null | {
    scheduledNext7: number;
    pendingApproval: number;
    publishedLast30: number;
    failed: number;
    nextPost: { caption: string; scheduledAt: string } | null;
  };
  agenda: null | { tasksToday: number; openTasks: number; messagesPending: number; messagesToday: number };
  queue: null | { waiting: number; calling: number; completedToday: number };
  blasts: null | { sending: number; sentLast30: number; failedLast30: number; campaigns: number };
  calls: null | { today: number; avgDurationSec: number; last7: number };
  projects: null | { total: number; byStatus: Array<{ status: string; count: number }> };
  planning: null | { boards: number; updatedLast7: number };
  notifications: null | { unread: number };
  team: null | Array<{ id: string; name: string; role: string; avatar_url: string | null; last_seen_at: string | null }>;
}

export async function buildDashboardSummary(profile: UserProfile, tenantId: string, modules: string[]): Promise<DashboardSummary> {
  const count = (table: string, apply?: (query: CountQuery) => CountQuery) => countIn(tenantId, table, apply);
  // Bloco só aparece se o módulo está no plano da empresa E o cargo permite.
  const allowed = (module: string, permission: string) => modules.includes(module) && hasPermission(profile, permission);
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();
  const canManage = profile.role === 'ADMIN' || profile.role === 'MANAGER';

  const [social, agenda, queue, blasts, calls, projects, planning, notifications, team] = await Promise.all([
    allowed('social', 'social.view')
      ? safe(async () => {
          const [scheduledNext7, pendingApproval, publishedLast30, failed, next] = await Promise.all([
            count('social_posts', (q) => q.eq('status', 'scheduled').lte('scheduled_at', iso(7))),
            count('social_posts', (q) => q.eq('status', 'pending_approval')),
            count('social_posts', (q) => q.in('status', ['published', 'published_late', 'partial']).gte('published_at', iso(-30))),
            count('social_posts', (q) => q.eq('status', 'failed')),
            supabaseAdmin
              .from('social_posts')
              .select('caption, scheduled_at')
              .eq('tenant_id', tenantId)
              .eq('status', 'scheduled')
              .gte('scheduled_at', iso(0))
              .order('scheduled_at')
              .limit(1)
              .maybeSingle(),
          ]);
          return {
            scheduledNext7,
            pendingApproval,
            publishedLast30,
            failed,
            nextPost: next.data ? { caption: next.data.caption || '', scheduledAt: next.data.scheduled_at } : null,
          };
        })
      : null,

    allowed('agendamento', 'integrations.view')
      ? safe(async () => {
          const today = todayKey();
          const [tasksToday, openTasks, messagesPending, messagesToday] = await Promise.all([
            count('scheduling_items', (q) => q.eq('date', today)),
            count('scheduling_items', (q) => q.eq('type', 'task').neq('status', 'done').lt('date', today)),
            count('scheduled_messages', (q) => q.eq('status', 'pending')),
            count('scheduled_messages', (q) => q.eq('scheduled_date', today).neq('status', 'canceled')),
          ]);
          return { tasksToday, openTasks, messagesPending, messagesToday };
        })
      : null,

    allowed('senhas', 'integrations.view')
      ? safe(async () => {
          const [waiting, calling, completedToday] = await Promise.all([
            count('attendance_queue_tickets', (q) => q.eq('queue_date', queueDay()).eq('status', 'waiting')),
            count('attendance_queue_tickets', (q) => q.eq('queue_date', queueDay()).eq('status', 'calling')),
            count('attendance_queue_tickets', (q) => q.eq('queue_date', queueDay()).eq('status', 'completed')),
          ]);
          return { waiting, calling, completedToday };
        })
      : null,

    allowed('crm', 'messages.send')
      ? safe(async () => {
          const { data, error } = await supabaseAdmin
            .from('blast_campaigns')
            .select('status, sent_count, failed_count, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', iso(-30));
          if (error) throw new Error(error.message);
          const rows = data || [];
          return {
            sending: rows.filter((row) => row.status === 'running').length,
            sentLast30: rows.reduce((sum, row) => sum + (row.sent_count || 0), 0),
            failedLast30: rows.reduce((sum, row) => sum + (row.failed_count || 0), 0),
            campaigns: rows.length,
          };
        })
      : null,

    allowed('crm', 'leads.view')
      ? safe(async () => {
          let query = supabaseAdmin.from('call_logs').select('duration, created_at').eq('tenant_id', tenantId).gte('created_at', iso(-7));
          // Vendedor vê as próprias ligações; gestores, as da equipe.
          if (!canManage) query = query.eq('user_id', profile.id);
          const { data, error } = await query;
          if (error) throw new Error(error.message);
          const rows = data || [];
          const today = rows.filter((row) => row.created_at >= startOfToday());
          const withDuration = today.filter((row) => (row.duration || 0) > 0);
          return {
            today: today.length,
            last7: rows.length,
            avgDurationSec: withDuration.length
              ? Math.round(withDuration.reduce((sum, row) => sum + row.duration, 0) / withDuration.length)
              : 0,
          };
        })
      : null,

    allowed('planejamentos', 'admin.projects')
      ? safe(async () => {
          const { data, error } = await supabaseAdmin.from('action_plans').select('status').eq('tenant_id', tenantId);
          if (error) throw new Error(error.message);
          const byStatus = new Map<string, number>();
          for (const row of data || []) byStatus.set(row.status || 'Sem status', (byStatus.get(row.status || 'Sem status') || 0) + 1);
          return {
            total: (data || []).length,
            byStatus: [...byStatus.entries()].map(([status, value]) => ({ status, count: value })).sort((a, b) => b.count - a.count),
          };
        })
      : null,

    allowed('planejamentos', 'planejamentos.view')
      ? safe(async () => {
          const [boards, updatedLast7] = await Promise.all([
            count('planning_boards'),
            count('planning_boards', (q) => q.gte('updated_at', iso(-7))),
          ]);
          return { boards, updatedLast7 };
        })
      : null,

    safe(async () => ({
      unread: await count('system_notifications', (q) => q.eq('user_id', profile.id).eq('is_read', false)),
    })),

    // Equipe com "visto por último". select('*') porque last_seen_at/avatar_url podem
    // ainda não existir no banco (migration pendente) -- aí vêm como null.
    safe(async () => {
      const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('tenant_id', tenantId).eq('status', 'ACTIVE').order('name');
      if (error) throw new Error(error.message);
      return (data || []).map((row) => ({
        id: row.id as string,
        name: (row.name as string) || 'Usuário',
        role: (row.role as string) || 'SELLER',
        avatar_url: (row.avatar_url as string | null) ?? null,
        last_seen_at: (row.last_seen_at as string | null) ?? null,
      }));
    }),
  ]);

  return { social, agenda, queue, blasts, calls, projects, planning, notifications, team };
}
