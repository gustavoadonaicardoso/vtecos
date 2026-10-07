/**
 * ============================================================
 * VTEC OS — Relatórios (Início e Relatórios), server-only
 * ============================================================
 * Monta o período (fuso de São Paulo), chama public.report_overview
 * no banco e devolve os números prontos para a tela. Vendedor vê só os
 * próprios leads e conversas; administrador e gerente veem a empresa,
 * a equipe, as automações e os disparos.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { zonedParts, zonedTime } from '@/lib/automations/flow';
import type { PeriodKey, ReportData, ResponseTimes } from '@/lib/reports';
import type { UserProfile } from '@/types';

const DAY = 86_400_000;
const MAX_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Json = Record<string, unknown>;
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const numOrNull = (value: unknown) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);
const obj = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});

/** Meia-noite (São Paulo) do dia de `date`, deslocada `offsetDays` dias. */
function startOfDay(date: Date, offsetDays = 0) {
  const parts = zonedParts(new Date(date.getTime() + offsetDays * DAY));
  return zonedTime(parts.year, parts.month, parts.day, 0, 0);
}

function fromDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return zonedTime(year, month, day, 0, 0);
}

export function resolveRange(period: string | null, fromKey: string | null, toKey: string | null, now = new Date()): { from: Date; to: Date; label: string; key: PeriodKey } | { error: string } {
  const key = (period || '30') as PeriodKey;
  if (key === 'today') return { from: startOfDay(now), to: now, label: 'Hoje', key };
  if (key === 'month') {
    const parts = zonedParts(now);
    return { from: zonedTime(parts.year, parts.month, 1, 0, 0), to: now, label: 'Este mês', key };
  }
  if (key === 'custom') {
    if (!fromKey || !toKey || !DATE_RE.test(fromKey) || !DATE_RE.test(toKey)) return { error: 'Escolha a data inicial e a final.' };
    const from = fromDateKey(fromKey);
    const to = new Date(Math.min(startOfDay(fromDateKey(toKey), 1).getTime(), now.getTime()));
    if (to <= from) return { error: 'A data final precisa ser depois da inicial.' };
    if (to.getTime() - from.getTime() > MAX_DAYS * DAY) return { error: `Escolha no máximo ${MAX_DAYS} dias.` };
    const show = (value: string) => value.split('-').reverse().join('/');
    return { from, to, label: `${show(fromKey)} a ${show(toKey)}`, key };
  }
  const days = [7, 30, 90].includes(Number(key)) ? Number(key) : 30;
  return { from: startOfDay(now, -(days - 1)), to: now, label: `Últimos ${days} dias`, key: String(days) as PeriodKey };
}

function responses(raw: unknown, names: Map<string, string>): ResponseTimes {
  const r = obj(raw);
  return {
    turns: num(r.turns),
    answered: num(r.answered),
    answeredByHuman: num(r.answered_by_human),
    medianAny: numOrNull(r.median_any),
    medianHuman: numOrNull(r.median_human),
    within5: num(r.within_5),
    byUser: list(r.by_user)
      .map((item) => ({ userId: String(item.user_id), name: names.get(String(item.user_id)) || 'Membro inativo', count: num(item.count), median: numOrNull(item.median) }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function buildReport(tenantId: string, profile: Pick<UserProfile, 'id' | 'role'>, range: { from: Date; to: Date; label: string }): Promise<{ data: ReportData } | { error: string; status: number }> {
  const mine = !['ADMIN', 'MANAGER'].includes(profile.role);
  const [{ data, error }, { data: people }] = await Promise.all([
    supabaseAdmin.rpc('report_overview', {
      p_tenant: tenantId,
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_user: mine ? profile.id : null,
      p_tz: 'America/Sao_Paulo',
    }),
    supabaseAdmin.from('profiles').select('id, name').eq('tenant_id', tenantId),
  ]);
  if (error) {
    const missing = /report_overview|report_response_times|function .* does not exist|could not find the function/i.test(error.message);
    return { error: missing ? 'Os relatórios precisam da migration 202610210001_reports.sql no Supabase.' : error.message, status: missing ? 503 : 500 };
  }

  const names = new Map((people || []).map((person) => [String(person.id), String(person.name || 'Usuário')]));
  const raw = obj(data);
  const leads = obj(raw.leads);
  const sales = obj(raw.sales);
  const messages = obj(raw.messages);
  const waiting = obj(raw.waiting);
  const answer = responses(raw.responses, names);
  const byUser = new Map(answer.byUser.map((item) => [item.userId, item]));

  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const cell of list(raw.heatmap)) {
    const dow = num(cell.dow);
    const hour = num(cell.hour);
    if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) heatmap[dow][hour] = num(cell.count);
  }

  const automations = raw.automations ? obj(raw.automations) : null;
  const campaigns = raw.campaigns ? obj(raw.campaigns) : null;
  const calls = obj(raw.calls);

  return {
    data: {
      range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label, days: Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY)) },
      scope: mine ? 'mine' : 'company',
      leads: { new: num(leads.new), newPrev: num(leads.new_prev), open: num(leads.open), openValue: num(leads.open_value) },
      sales: { won: num(sales.won), wonPrev: num(sales.won_prev), revenue: num(sales.revenue), revenuePrev: num(sales.revenue_prev), cohortWon: num(sales.cohort_won) },
      messages: {
        received: num(messages.received),
        receivedPrev: num(messages.received_prev),
        sent: num(messages.sent),
        byKind: Object.fromEntries(Object.entries(obj(messages.by_kind)).map(([kind, value]) => [kind, num(value)])),
        conversations: num(messages.conversations),
        conversationsPrev: num(messages.conversations_prev),
      },
      daily: list(raw.daily).map((day) => ({ date: String(day.date), newLeads: num(day.new_leads), won: num(day.won), revenue: num(day.revenue), received: num(day.received), sent: num(day.sent) })),
      heatmap,
      sources: list(raw.sources).map((item) => ({ source: String(item.source), total: num(item.total), won: num(item.won), revenue: num(item.revenue) })),
      funnel: list(raw.funnel).map((item) => ({ id: String(item.id), name: String(item.name), color: String(item.color || '#3b82f6'), count: num(item.count), value: num(item.value) })),
      waiting: {
        count: num(waiting.count),
        over1h: num(waiting.over_1h),
        oldest: list(waiting.oldest).map((item) => ({
          id: String(item.id),
          name: String(item.name || 'Sem nome'),
          assignedTo: item.assigned_to ? String(item.assigned_to) : null,
          assignedName: item.assigned_to ? names.get(String(item.assigned_to)) || null : null,
          since: String(item.since),
          waitMinutes: Math.max(0, (Date.now() - new Date(String(item.since)).getTime()) / 60_000),
        })),
      },
      responses: answer,
      responsesPrev: responses(raw.responses_prev, names),
      team: Array.isArray(raw.team)
        ? list(raw.team)
            .map((member) => {
              const answered = byUser.get(String(member.id));
              return {
                id: String(member.id),
                name: String(member.name || 'Usuário'),
                role: String(member.role || 'SELLER'),
                openLeads: num(member.open_leads),
                newLeads: num(member.new_leads),
                won: num(member.won),
                revenue: num(member.revenue),
                messages: num(member.messages),
                conversations: num(member.conversations),
                firstResponses: answered?.count || 0,
                medianResponse: answered?.median ?? null,
              };
            })
        : null,
      automations: automations
        ? {
            runs: num(automations.runs),
            byStatus: Object.fromEntries(Object.entries(obj(automations.by_status)).map(([status, value]) => [status, num(value)])),
            flows: list(automations.flows).map((flow) => ({ id: String(flow.id), name: String(flow.name || 'Fluxo excluído'), runs: num(flow.runs), failed: num(flow.failed) })),
            ai: {
              conversations: num(obj(automations.ai).conversations),
              replies: num(obj(automations.ai).replies),
              handoffs: num(obj(automations.ai).handoffs),
              resolved: num(obj(automations.ai).resolved),
            },
          }
        : null,
      campaigns: campaigns
        ? {
            count: num(campaigns.count),
            sent: num(campaigns.sent),
            failed: num(campaigns.failed),
            replied: num(campaigns.replied),
            optouts: num(campaigns.optouts),
            top: list(campaigns.top).map((item) => ({ id: String(item.id), name: String(item.name || 'Campanha'), status: String(item.status), sent: num(item.sent), replied: num(item.replied), failed: num(item.failed) })),
          }
        : null,
      calls: { count: num(calls.count), avgDuration: num(calls.avg_duration) },
    },
  };
}
