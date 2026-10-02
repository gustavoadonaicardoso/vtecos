import type { Lead } from '@/types';

export const GOALS_STORAGE_KEY = 'vortice_goals';

export type GoalType = 'goal' | 'objective' | 'plan';
export type GoalMetric = 'total_leads' | 'won_leads' | 'stage_leads' | 'revenue';
export type GoalVisibility = 'public' | 'private';

export interface GoalTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface GoalPlan {
  id: string;
  title: string;
  description: string;
  type: GoalType;
  metric: GoalMetric;
  targetValue: number;
  deadline: string;
  stageIds: string[];
  visibility: GoalVisibility;
  viewerIds: string[];
  ownerId: string;
  tasks: GoalTask[];
  createdAt: string;
  updatedAt: string;
}

export const goalTypeLabel = (type: GoalType) => ({
  goal: 'Meta',
  objective: 'Objetivo',
  plan: 'Plano',
}[type]);

export const goalMetricLabel = (metric: GoalMetric) => ({
  total_leads: 'Leads no pipeline',
  won_leads: 'Leads ganhos',
  stage_leads: 'Leads em etapas selecionadas',
  revenue: 'Receita de leads ganhos',
}[metric]);

export function parseLeadValue(raw?: string): number {
  if (!raw) return 0;
  const normalized = String(raw)
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return Number.parseFloat(normalized.replace(/[^0-9.-]/g, '')) || 0;
}

export function readGoals(): GoalPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GOALS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((goal): goal is GoalPlan => {
      if (!goal || typeof goal !== 'object') return false;
      const item = goal as Partial<GoalPlan>;
      return typeof item.id === 'string'
        && typeof item.title === 'string'
        && typeof item.ownerId === 'string'
        && typeof item.targetValue === 'number'
        && Array.isArray(item.stageIds)
        && Array.isArray(item.viewerIds)
        && Array.isArray(item.tasks);
    });
  } catch {
    return [];
  }
}

export function canViewGoal(goal: GoalPlan, userId?: string | null, isAdmin = false): boolean {
  if (!userId) return false;
  return isAdmin || goal.visibility === 'public' || goal.ownerId === userId || goal.viewerIds.includes(userId);
}

export function getGoalCurrentValue(goal: GoalPlan, leads: Lead[]): number {
  const relevantLeads = goal.metric === 'stage_leads'
    ? leads.filter(lead => goal.stageIds.includes(lead.pipelineStage))
    : leads;

  if (goal.metric === 'total_leads') return leads.length;
  if (goal.metric === 'won_leads') return leads.filter(lead => lead.pipelineStage === 'ganho').length;
  if (goal.metric === 'stage_leads') return relevantLeads.length;
  return leads
    .filter(lead => lead.pipelineStage === 'ganho')
    .reduce((total, lead) => total + parseLeadValue(lead.value), 0);
}

export function getGoalProgress(goal: GoalPlan, leads: Lead[]): number {
  if (goal.targetValue <= 0) return 0;
  return Math.min(100, Math.round((getGoalCurrentValue(goal, leads) / goal.targetValue) * 100));
}

export function formatGoalValue(value: number, metric: GoalMetric): string {
  if (metric === 'revenue') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat('pt-BR').format(value);
}

export type GoalPaceStatus = 'done' | 'on_track' | 'at_risk' | 'behind' | 'overdue' | 'no_deadline';

export interface GoalPace {
  status: GoalPaceStatus;
  /** Quanto deveria estar concluído hoje, se o avanço fosse linear até o prazo (0–100). */
  expected: number | null;
  /** Onde chega no prazo mantendo o ritmo atual (pode passar de 100). */
  projected: number | null;
  daysLeft: number | null;
}

export const goalPaceLabel = (status: GoalPaceStatus) => ({
  done: 'Cumprida',
  on_track: 'No ritmo',
  at_risk: 'Em risco',
  behind: 'Abaixo do ritmo',
  overdue: 'Prazo vencido',
  no_deadline: 'Sem prazo',
}[status]);

/**
 * Compara o progresso real com o tempo já decorrido entre a criação e o
 * prazo. Ex.: passou metade do prazo e a meta está em 30% → abaixo do ritmo.
 */
export function getGoalPace(goal: GoalPlan, progress: number, now = Date.now()): GoalPace {
  const deadline = goal.deadline ? new Date(`${goal.deadline}T23:59:59`).getTime() : NaN;
  const daysLeft = Number.isNaN(deadline) ? null : Math.ceil((deadline - now) / 86_400_000);

  if (progress >= 100) return { status: 'done', expected: 100, projected: progress, daysLeft };
  if (Number.isNaN(deadline)) return { status: 'no_deadline', expected: null, projected: null, daysLeft: null };
  if (now > deadline) return { status: 'overdue', expected: 100, projected: progress, daysLeft };

  const start = new Date(goal.createdAt).getTime();
  const total = deadline - start;
  if (!Number.isFinite(start) || total <= 0) return { status: 'on_track', expected: null, projected: null, daysLeft };

  const elapsed = Math.min(1, Math.max(0, (now - start) / total));
  const expected = Math.round(elapsed * 100);
  // No começo do prazo a projeção não diz nada (dividiria por quase zero).
  const projected = elapsed >= 0.05 ? Math.round(progress / elapsed) : null;

  const status: GoalPaceStatus = progress >= expected - 5 ? 'on_track' : progress >= expected - 20 ? 'at_risk' : 'behind';
  return { status, expected, projected, daysLeft };
}

export function getGoalProgressLabel(progress: number): string {
  if (progress >= 100) return 'Cumprida';
  if (progress >= 75) return 'Próxima';
  if (progress >= 40) return 'Em andamento';
  return 'Atenção';
}
