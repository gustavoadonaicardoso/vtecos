/**
 * Cálculos dos Relatórios — tudo a partir dos leads reais do CRM.
 * Funções puras: recebem os leads e devolvem os números de cada bloco.
 * O período sempre considera a data de ENTRADA do lead (coorte): "dos
 * leads que entraram nos últimos 30 dias, quantos viraram ganho".
 */

import { parseLeadValue } from '@/lib/goals';
import type { Lead, PipelineStage } from '@/types';

export const WON_STAGE = 'ganho';
const DAY = 86_400_000;

export type ReportPeriod = 7 | 30 | 90 | 0; // 0 = todo o histórico

/** createdAt (ISO) quando existe; senão a entryDate em dd/mm/aaaa. */
export function leadDate(lead: Lead): Date | null {
  if (lead.createdAt) {
    const parsed = new Date(lead.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(lead.entryDate || '');
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export interface PeriodRange {
  start: Date;
  end: Date;
  previousStart: Date | null;
  days: number;
}

export function periodRange(period: ReportPeriod, leads: Lead[], now = new Date()): PeriodRange {
  const end = now;
  if (period > 0) {
    const start = startOfDay(new Date(now.getTime() - (period - 1) * DAY));
    return { start, end, previousStart: new Date(start.getTime() - period * DAY), days: period };
  }
  const dates = leads.map(leadDate).filter((date): date is Date => date !== null);
  const first = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : now;
  const start = startOfDay(first);
  const days = Math.max(1, Math.round((startOfDay(now).getTime() - start.getTime()) / DAY) + 1);
  return { start, end, previousStart: null, days };
}

function inRange(lead: Lead, from: Date, to: Date) {
  const date = leadDate(lead);
  return date !== null && date >= from && date <= to;
}

export const isWon = (lead: Lead) => lead.pipelineStage === WON_STAGE;
export const leadValue = (lead: Lead) => parseLeadValue(lead.value);

interface Snapshot {
  total: number;
  won: number;
  conversion: number;
  revenue: number;
  ticket: number;
}

function snapshot(leads: Lead[]): Snapshot {
  const won = leads.filter(isWon);
  const revenue = won.reduce((sum, lead) => sum + leadValue(lead), 0);
  return {
    total: leads.length,
    won: won.length,
    conversion: leads.length ? (won.length / leads.length) * 100 : 0,
    revenue,
    ticket: won.length ? revenue / won.length : 0,
  };
}

/** Variação percentual; null quando não há base de comparação. */
function delta(current: number, previous: number | null) {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface DailyPoint {
  date: string;
  label: string;
  novos: number;
  ganhos: number;
  receita: number;
}

export interface ReportData {
  range: PeriodRange;
  periodLeads: Lead[];
  current: Snapshot;
  deltas: { total: number | null; conversion: number | null; revenue: number | null; ticket: number | null };
  daily: DailyPoint[];
  funnel: Array<{ id: string; name: string; color: string; count: number; reached: number; share: number; stepConversion: number | null }>;
  sources: Array<{ name: string; total: number; won: number; conversion: number; revenue: number; color: string }>;
  heatmap: { grid: number[][]; max: number; hasHours: boolean };
  team: Array<{ id: string | null; total: number; won: number; conversion: number; revenue: number; handling: number; wait: number }>;
  service: { handling: number; wait: number };
}

const SOURCE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];

const average = (values: number[]) => {
  const valid = values.filter((value) => value > 0);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
};

export function buildReport(allLeads: Lead[], stages: PipelineStage[], period: ReportPeriod, now = new Date()): ReportData {
  const range = periodRange(period, allLeads, now);
  const periodLeads = allLeads.filter((lead) => inRange(lead, range.start, range.end));
  const previousLeads = range.previousStart
    ? allLeads.filter((lead) => inRange(lead, range.previousStart!, new Date(range.start.getTime() - 1)))
    : null;

  const current = snapshot(periodLeads);
  const previous = previousLeads ? snapshot(previousLeads) : null;

  // ── Série diária (agrupa por semana quando o período é longo) ──
  const bucketDays = range.days > 120 ? 7 : 1;
  const buckets = Math.ceil(range.days / bucketDays);
  const daily: DailyPoint[] = Array.from({ length: buckets }, (_, index) => {
    const date = new Date(range.start.getTime() + index * bucketDays * DAY);
    return {
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      novos: 0,
      ganhos: 0,
      receita: 0,
    };
  });
  for (const lead of periodLeads) {
    const date = leadDate(lead);
    if (!date) continue;
    const index = Math.min(buckets - 1, Math.floor((startOfDay(date).getTime() - range.start.getTime()) / (bucketDays * DAY)));
    if (index < 0) continue;
    daily[index].novos += 1;
    if (isWon(lead)) {
      daily[index].ganhos += 1;
      daily[index].receita += leadValue(lead);
    }
  }

  // ── Funil: quantos estão em cada etapa e quantos chegaram até ela ──
  // "Chegaram" = estão nesta etapa ou em uma posterior (o pipeline é sequencial).
  const counts = stages.map((stage) => periodLeads.filter((lead) => lead.pipelineStage === stage.id).length);
  const funnel = stages.map((stage, index) => {
    const reached = counts.slice(index).reduce((sum, count) => sum + count, 0);
    const previousReached = index > 0 ? counts.slice(index - 1).reduce((sum, count) => sum + count, 0) : null;
    return {
      id: stage.id,
      name: stage.name,
      color: stage.color,
      count: counts[index],
      reached,
      share: periodLeads.length ? (reached / periodLeads.length) * 100 : 0,
      stepConversion: previousReached ? (reached / previousReached) * 100 : null,
    };
  });

  // ── Origem ──
  const bySource = new Map<string, Lead[]>();
  for (const lead of periodLeads) {
    const key = (lead.source || 'Não informado').trim() || 'Não informado';
    bySource.set(key, [...(bySource.get(key) || []), lead]);
  }
  const sources = [...bySource.entries()]
    .map(([name, leads]) => {
      const stats = snapshot(leads);
      return { name, total: stats.total, won: stats.won, conversion: stats.conversion, revenue: stats.revenue, color: '' };
    })
    .sort((a, b) => b.total - a.total)
    .map((source, index) => ({ ...source, color: SOURCE_COLORS[index % SOURCE_COLORS.length] }));

  // ── Mapa de calor: dia da semana × faixa de horário ──
  const hasHours = periodLeads.some((lead) => Boolean(lead.createdAt));
  const grid = Array.from({ length: 7 }, () => Array.from({ length: hasHours ? 6 : 1 }, () => 0));
  for (const lead of periodLeads) {
    const date = leadDate(lead);
    if (!date) continue;
    const slot = hasHours ? Math.floor(date.getHours() / 4) : 0;
    grid[date.getDay()][slot] += 1;
  }
  const max = Math.max(0, ...grid.flat());

  // ── Equipe ──
  const byOwner = new Map<string | null, Lead[]>();
  for (const lead of periodLeads) {
    const key = lead.assignedTo || null;
    byOwner.set(key, [...(byOwner.get(key) || []), lead]);
  }
  const team = [...byOwner.entries()]
    .map(([id, leads]) => {
      const stats = snapshot(leads);
      return {
        id,
        total: stats.total,
        won: stats.won,
        conversion: stats.conversion,
        revenue: stats.revenue,
        handling: average(leads.map((lead) => lead.handlingTime || 0)),
        wait: average(leads.map((lead) => lead.waitTime || 0)),
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.won - a.won || b.total - a.total);

  return {
    range,
    periodLeads,
    current,
    deltas: {
      total: delta(current.total, previous?.total ?? null),
      conversion: previous && previous.total > 0 ? current.conversion - previous.conversion : null,
      revenue: delta(current.revenue, previous?.revenue ?? null),
      ticket: delta(current.ticket, previous?.ticket ?? null),
    },
    daily,
    funnel,
    sources,
    heatmap: { grid, max, hasHours },
    team,
    service: {
      handling: average(periodLeads.map((lead) => lead.handlingTime || 0)),
      wait: average(periodLeads.map((lead) => lead.waitTime || 0)),
    },
  };
}

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const HOUR_SLOTS = ['0–4h', '4–8h', '8–12h', '12–16h', '16–20h', '20–24h'];

/** Frases automáticas a partir dos números — só aparecem quando há base suficiente. */
export function buildHighlights(report: ReportData): string[] {
  const highlights: string[] = [];
  const { sources, funnel, heatmap, current, deltas } = report;

  const bestSource = sources.filter((source) => source.total >= 3).sort((a, b) => b.conversion - a.conversion)[0];
  if (bestSource && bestSource.won > 0) {
    highlights.push(`**${bestSource.name}** é a origem que mais converte: ${bestSource.conversion.toFixed(0)}% dos leads viraram ganho.`);
  }

  const drop = funnel
    .filter((step) => step.stepConversion !== null && step.reached > 0)
    .sort((a, b) => (a.stepConversion ?? 100) - (b.stepConversion ?? 100))[0];
  const dropIndex = drop ? funnel.findIndex((step) => step.id === drop.id) : -1;
  if (drop && dropIndex > 0 && (drop.stepConversion ?? 100) < 80) {
    highlights.push(
      `O maior gargalo está entre **${funnel[dropIndex - 1].name}** e **${drop.name}**: só ${drop.stepConversion!.toFixed(0)}% avançam.`
    );
  }

  if (heatmap.max > 0 && current.total >= 5) {
    const totals = heatmap.grid.map((row) => row.reduce((sum, value) => sum + value, 0));
    const busiest = totals.indexOf(Math.max(...totals));
    const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    highlights.push(`**${names[busiest][0].toUpperCase()}${names[busiest].slice(1)}** é o dia com mais entradas de leads.`);
  }

  if (deltas.total !== null && Math.abs(deltas.total) >= 10) {
    highlights.push(
      deltas.total > 0
        ? `A entrada de leads **cresceu ${deltas.total.toFixed(0)}%** em relação ao período anterior.`
        : `A entrada de leads **caiu ${Math.abs(deltas.total).toFixed(0)}%** em relação ao período anterior.`
    );
  }

  return highlights.slice(0, 4);
}

export function toCsv(leads: Lead[], stages: PipelineStage[], ownerName: (id: string | null) => string) {
  const stageName = (id: string) => stages.find((stage) => stage.id === id)?.name || id;
  const escape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['Nome', 'E-mail', 'Telefone', 'Etapa', 'Origem', 'Valor', 'Responsável', 'Entrada'];
  const rows = leads.map((lead) => [
    lead.name,
    lead.email,
    lead.phone,
    stageName(lead.pipelineStage),
    lead.source || '',
    leadValue(lead).toFixed(2).replace('.', ','),
    ownerName(lead.assignedTo || null),
    lead.entryDate,
  ]);
  // BOM para o Excel abrir os acentos corretamente; ";" é o separador do Excel em pt-BR.
  return '﻿' + [header, ...rows].map((row) => row.map(escape).join(';')).join('\n');
}
