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

/** count exato sem trazer linhas. */
async function count(table: string, apply: (query: any) => any = (query) => query): Promise<number> {
  const { count: total, error } = await apply(supabaseAdmin.from(table).select('id', { count: 'exact', head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return total ?? 0;
}

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

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

export async function buildDashboardSummary(profile: UserProfile): Promise<DashboardSummary> {
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();
  const canManage = profile.role === 'ADMIN' || profile.role === 'MANAGER';

  const [social, agenda, queue, blasts, calls, projects, planning, notifications, team] = await Promise.all([
    hasPermission(profile, 'social.view')
      ? safe(async () => {
          const [scheduledNext7, pendingApproval, publishedLast30, failed, next] = await Promise.all([
            count('social_posts', (q) => q.eq('status', 'scheduled').lte('scheduled_at', iso(7))),
            count('social_posts', (q) => q.eq('status', 'pending_approval')),
            count('social_posts', (q) => q.in('status', ['published', 'published_late', 'partial']).gte('published_at', iso(-30))),
            count('social_posts', (q) => q.eq('status', 'failed')),
            supabaseAdmin
              .from('social_posts')
              .select('caption, scheduled_at')
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

    hasPermission(profile, 'integrations.view')
      ? safe(async () => {
          const today = todayKey();
          const [tasksToday, openTasks, messagesPending, messagesToday] = await Promise.all([
            count('scheduling_items', (q) => q.eq('date', today)),
            count('scheduling_items', (q) => q.neq('status', 'done').lte('date', today)),
            count('scheduled_messages', (q) => q.eq('status', 'pending')),
            count('scheduled_messages', (q) => q.eq('scheduled_date', today)),
          ]);
          return { tasksToday, openTasks, messagesPending, messagesToday };
        })
      : null,

    hasPermission(profile, 'integrations.view')
      ? safe(async () => {
          const [waiting, calling, completedToday] = await Promise.all([
            count('attendance_queue_tickets', (q) => q.eq('status', 'waiting')),
            count('attendance_queue_tickets', (q) => q.eq('status', 'calling')),
            count('attendance_queue_tickets', (q) => q.eq('status', 'completed').gte('updated_at', startOfToday())),
          ]);
          return { waiting, calling, completedToday };
        })
      : null,

    hasPermission(profile, 'messages.send')
      ? safe(async () => {
          const { data, error } = await supabaseAdmin
            .from('blast_campaigns')
            .select('status, sent_count, failed_count, created_at')
            .gte('created_at', iso(-30));
          if (error) throw new Error(error.message);
          const rows = data || [];
          return {
            sending: rows.filter((row) => row.status === 'sending').length,
            sentLast30: rows.reduce((sum, row) => sum + (row.sent_count || 0), 0),
            failedLast30: rows.reduce((sum, row) => sum + (row.failed_count || 0), 0),
            campaigns: rows.length,
          };
        })
      : null,

    hasPermission(profile, 'leads.view')
      ? safe(async () => {
          let query = supabaseAdmin.from('call_logs').select('duration, created_at').gte('created_at', iso(-7));
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

    hasPermission(profile, 'admin.projects')
      ? safe(async () => {
          const { data, error } = await supabaseAdmin.from('action_plans').select('status');
          if (error) throw new Error(error.message);
          const byStatus = new Map<string, number>();
          for (const row of data || []) byStatus.set(row.status || 'Sem status', (byStatus.get(row.status || 'Sem status') || 0) + 1);
          return {
            total: (data || []).length,
            byStatus: [...byStatus.entries()].map(([status, value]) => ({ status, count: value })).sort((a, b) => b.count - a.count),
          };
        })
      : null,

    hasPermission(profile, 'planejamentos.view')
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
      const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('status', 'ACTIVE').neq('account_type', 'CLIENT').order('name');
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
