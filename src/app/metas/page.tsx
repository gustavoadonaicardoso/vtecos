"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  Eye,
  Flag,
  Gauge,
  Hourglass,
  LayoutGrid,
  Lock,
  Pencil,
  Plus,
  Save,
  Target,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import styles from './metas.module.css';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import { supabase } from '@/lib/supabase';
import type { PipelineStage } from '@/types';
import {
  canViewGoal,
  formatGoalValue,
  getGoalCurrentValue,
  getGoalPace,
  getGoalProgress,
  getGoalProgressLabel,
  goalMetricLabel,
  goalPaceLabel,
  goalTypeLabel,
  type GoalMetric,
  type GoalPace,
  type GoalPaceStatus,
  type GoalPlan,
  type GoalTask,
  type GoalType,
  type GoalVisibility,
} from '@/lib/goals';
import {
  createGoalOnServer,
  deleteGoalOnServer,
  fetchGoalsFromServer,
  migrateLocalGoalsIfAny,
  updateGoalOnServer,
} from '@/lib/goals-client';

interface GoalUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

interface GoalFormState {
  title: string;
  description: string;
  type: GoalType;
  metric: GoalMetric;
  targetValue: string;
  deadline: string;
  stageIds: string[];
  visibility: GoalVisibility;
  viewerIds: string[];
}

/** Meta já com os números calculados, pra não recalcular em cada pedaço da tela. */
interface GoalView {
  goal: GoalPlan;
  current: number;
  progress: number;
  pace: GoalPace;
}

const EMPTY_FORM: GoalFormState = {
  title: '',
  description: '',
  type: 'goal',
  metric: 'won_leads',
  targetValue: '',
  deadline: '',
  stageIds: [],
  visibility: 'public',
  viewerIds: [],
};

const TYPE_COLORS: Record<GoalType, string> = {
  goal: '#3b82f6',
  objective: '#8b5cf6',
  plan: '#10b981',
};

const PACE_COLORS: Record<GoalPaceStatus, string> = {
  done: '#10b981',
  on_track: '#10b981',
  at_risk: '#f59e0b',
  behind: '#ef4444',
  overdue: '#ef4444',
  no_deadline: '#64748b',
};

const PROGRESS_BUCKETS = [
  { key: 'Cumprida', label: 'Cumpridas', color: '#10b981' },
  { key: 'Próxima', label: 'Próximas', color: '#3b82f6' },
  { key: 'Em andamento', label: 'Em andamento', color: '#8b5cf6' },
  { key: 'Atenção', label: 'Atenção', color: '#f59e0b' },
];

const progressColor = (progress: number) =>
  progress >= 100 ? '#10b981' : progress >= 75 ? '#3b82f6' : progress >= 40 ? '#8b5cf6' : '#f59e0b';

const makeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const formatDate = (date?: string) => {
  if (!date) return 'Sem prazo definido';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Sem prazo definido' : parsed.toLocaleDateString('pt-BR');
};

const formatDaysLeft = (days: number | null) => {
  if (days === null) return 'Sem prazo';
  if (days < 0) return `Venceu há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'Vence hoje';
  return `${days} ${days === 1 ? 'dia restante' : 'dias restantes'}`;
};

function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  color,
  marker,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  /** Posição esperada (0–100), desenhada como um traço no anel. */
  marker?: number | null;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const markerAngle = marker === null || marker === undefined ? null : (Math.min(100, Math.max(0, marker)) / 100) * 2 * Math.PI;

  return (
    <div className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={styles.ringValue}
        />
        {markerAngle !== null && (
          <line
            x1={size / 2 + (radius - stroke) * Math.sin(markerAngle)}
            y1={size / 2 - (radius - stroke) * Math.cos(markerAngle)}
            x2={size / 2 + (radius + stroke) * Math.sin(markerAngle)}
            y2={size / 2 - (radius + stroke) * Math.cos(markerAngle)}
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.7}
          />
        )}
      </svg>
      <div className={styles.ringLabel}>{children}</div>
    </div>
  );
}

function PaceBadge({ pace }: { pace: GoalPace }) {
  return (
    <span className={styles.paceBadge} style={{ '--pace-color': PACE_COLORS[pace.status] } as React.CSSProperties}>
      <span className={styles.paceDot} /> {goalPaceLabel(pace.status)}
    </span>
  );
}

/** Barra real x esperado: o preenchimento é o progresso, o traço é onde deveria estar hoje. */
function PaceTrack({ view }: { view: GoalView }) {
  const { progress, pace } = view;
  return (
    <div className={styles.paceTrackBlock}>
      <div className={styles.paceTrack}>
        <span className={styles.paceFill} style={{ width: `${progress}%`, background: PACE_COLORS[pace.status] }} />
        {pace.expected !== null && pace.status !== 'done' && (
          <span className={styles.paceMarker} style={{ left: `${pace.expected}%` }} title={`Esperado hoje: ${pace.expected}%`} />
        )}
      </div>
      <div className={styles.paceLegend}>
        <span><i style={{ background: PACE_COLORS[pace.status] }} /> Real {progress}%</span>
        {pace.expected !== null && pace.status !== 'done' && <span><i className={styles.legendMarker} /> Esperado hoje {pace.expected}%</span>}
      </div>
    </div>
  );
}

export default function MetasPage() {
  const { user } = useAuth();
  const { leads, pipelineStages } = useLeads();
  const [goals, setGoals] = useState<GoalPlan[]>([]);
  const [users, setUsers] = useState<GoalUser[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'public'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | GoalType>('all');
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);
  const [taskTitle, setTaskTitle] = useState('');
  const [formError, setFormError] = useState('');
  const isAdmin = user?.role === 'ADMIN';

  const loadGoals = async () => {
    if (!user) return;
    try {
      await migrateLocalGoalsIfAny(user.id);
      const serverGoals = await fetchGoalsFromServer(user.id);
      setGoals(serverGoals);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as metas.');
    } finally {
      setHydrated(true);
    }
  };

  useEffect(() => {
    loadGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const fetchUsers = async () => {
      if (supabase) {
        const { data } = await supabase.from('profiles').select('id,name,email,role').neq('account_type', 'CLIENT').order('name');
        if (!cancelled && data?.length) {
          setUsers(data.map(profile => ({ id: profile.id, name: profile.name, email: profile.email, role: profile.role })));
          return;
        }
      }
      if (!cancelled && user) setUsers([{ id: user.id, name: user.name, email: user.email, role: user.role }]);
    };
    fetchUsers();
    return () => { cancelled = true; };
  }, [user]);

  const accessibleViews = useMemo<GoalView[]>(() => goals
    .filter(goal => canViewGoal(goal, user?.id, isAdmin))
    .map(goal => {
      const progress = getGoalProgress(goal, leads);
      return { goal, current: getGoalCurrentValue(goal, leads), progress, pace: getGoalPace(goal, progress) };
    }), [goals, isAdmin, leads, user?.id]);

  const visibleViews = useMemo(() => accessibleViews
    .filter(({ goal }) => filter === 'all' || (filter === 'mine' ? goal.ownerId === user?.id : goal.visibility === 'public'))
    .filter(({ goal }) => typeFilter === 'all' || goal.type === typeFilter)
    .sort((a, b) => (a.goal.deadline || '9999').localeCompare(b.goal.deadline || '9999')), [accessibleViews, filter, typeFilter, user?.id]);

  const selected = visibleViews.find(view => view.goal.id === selectedGoalId) || visibleViews[0];

  // ── Indicadores (sobre tudo que o usuário enxerga, sem os filtros da lista) ──
  const indicators = useMemo(() => {
    const total = accessibleViews.length;
    const average = total ? Math.round(accessibleViews.reduce((sum, view) => sum + view.progress, 0) / total) : 0;
    const buckets = PROGRESS_BUCKETS.map(bucket => ({
      ...bucket,
      count: accessibleViews.filter(view => getGoalProgressLabel(view.progress) === bucket.key).length,
    }));
    const pace = {
      on_track: accessibleViews.filter(view => view.pace.status === 'on_track' || view.pace.status === 'done').length,
      at_risk: accessibleViews.filter(view => view.pace.status === 'at_risk').length,
      behind: accessibleViews.filter(view => view.pace.status === 'behind' || view.pace.status === 'overdue').length,
    };
    const nextDeadline = accessibleViews
      .filter(view => view.progress < 100 && view.pace.daysLeft !== null && view.pace.daysLeft >= 0)
      .sort((a, b) => (a.pace.daysLeft ?? 0) - (b.pace.daysLeft ?? 0))[0];
    return { total, average, buckets, pace, nextDeadline };
  }, [accessibleViews]);

  const startCreate = () => {
    setEditingGoalId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const startEdit = (goal: GoalPlan) => {
    setEditingGoalId(goal.id);
    setForm({
      title: goal.title,
      description: goal.description,
      type: goal.type,
      metric: goal.metric,
      targetValue: String(goal.targetValue),
      deadline: goal.deadline,
      stageIds: goal.stageIds,
      visibility: goal.visibility,
      viewerIds: goal.viewerIds,
    });
    setFormError('');
    setShowForm(true);
  };

  const submitGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const title = form.title.trim();
    const targetValue = Number(form.targetValue.replace(',', '.'));
    if (!title) return setFormError('Informe um título para o planejamento.');
    if (!Number.isFinite(targetValue) || targetValue <= 0) return setFormError('Informe um valor-alvo maior que zero.');
    if (form.metric === 'stage_leads' && form.stageIds.length === 0) return setFormError('Escolha ao menos uma etapa do funil.');

    try {
      if (editingGoalId) {
        const updated = await updateGoalOnServer(user.id, editingGoalId, {
          title,
          description: form.description.trim(),
          type: form.type,
          metric: form.metric,
          targetValue,
          deadline: form.deadline,
          stageIds: form.stageIds,
          visibility: form.visibility,
          viewerIds: form.visibility === 'public' ? [] : form.viewerIds,
        });
        setGoals(current => current.map(goal => goal.id === editingGoalId ? updated : goal));
        setSelectedGoalId(editingGoalId);
      } else {
        const newGoal: GoalPlan = {
          id: makeId('goal'),
          title,
          description: form.description.trim(),
          type: form.type,
          metric: form.metric,
          targetValue,
          deadline: form.deadline,
          stageIds: form.stageIds,
          visibility: form.visibility,
          viewerIds: form.visibility === 'public' ? [] : form.viewerIds,
          ownerId: user.id,
          tasks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const created = await createGoalOnServer(user.id, newGoal);
        setGoals(current => [created, ...current]);
        setSelectedGoalId(created.id);
      }
      setShowForm(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o planejamento.');
    }
  };

  const deleteGoal = async (goal: GoalPlan) => {
    if (!window.confirm(`Excluir “${goal.title}”?`)) return;
    if (!user) return;
    try {
      await deleteGoalOnServer(user.id, goal.id);
      setGoals(current => current.filter(item => item.id !== goal.id));
      setSelectedGoalId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível excluir o planejamento.');
    }
  };

  const toggleTask = async (goal: GoalPlan, taskId: string) => {
    if (!user) return;
    const nextTasks = goal.tasks.map(task => task.id === taskId ? { ...task, completed: !task.completed } : task);
    try {
      const updated = await updateGoalOnServer(user.id, goal.id, { tasks: nextTasks });
      setGoals(current => current.map(item => item.id === goal.id ? updated : item));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível atualizar a tarefa.');
    }
  };

  const addTask = async (goal: GoalPlan) => {
    const title = taskTitle.trim();
    if (!title || !user) return;
    const task: GoalTask = { id: makeId('task'), title, completed: false };
    const nextTasks = [...goal.tasks, task];
    try {
      const updated = await updateGoalOnServer(user.id, goal.id, { tasks: nextTasks });
      setGoals(current => current.map(item => item.id === goal.id ? updated : item));
      setTaskTitle('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível adicionar a tarefa.');
    }
  };

  const toggleStage = (stageId: string) => setForm(current => ({
    ...current,
    stageIds: current.stageIds.includes(stageId) ? current.stageIds.filter(id => id !== stageId) : [...current.stageIds, stageId],
  }));

  const toggleViewer = (userId: string) => setForm(current => ({
    ...current,
    viewerIds: current.viewerIds.includes(userId) ? current.viewerIds.filter(id => id !== userId) : [...current.viewerIds, userId],
  }));

  if (!hydrated) {
    return <div className={styles.loadingState}>Carregando metas e objetivos…</div>;
  }

  const renderDetail = (view: GoalView) => {
    const { goal, current, progress, pace } = view;
    const remaining = Math.max(0, goal.targetValue - current);
    const weeksLeft = pace.daysLeft !== null && pace.daysLeft > 0 ? Math.max(1, pace.daysLeft / 7) : null;
    const perWeek = weeksLeft ? remaining / weeksLeft : null;
    const doneTasks = goal.tasks.filter(task => task.completed).length;

    return (
      <aside className={styles.detailPanel} aria-label="Detalhes do planejamento">
        <div className={styles.detailHeader}>
          <div>
            <span className={styles.typeBadge} style={{ '--type-color': TYPE_COLORS[goal.type] } as React.CSSProperties}>
              {goalTypeLabel(goal.type)}
            </span>
            <h2>{goal.title}</h2>
          </div>
          <div className={styles.detailActions}>
            <button type="button" className={styles.iconButton} onClick={() => startEdit(goal)} title="Editar planejamento"><Pencil size={15} /></button>
            <button type="button" className={`${styles.iconButton} ${styles.iconDanger}`} onClick={() => deleteGoal(goal)} title="Excluir planejamento"><Trash2 size={15} /></button>
          </div>
        </div>
        {goal.description && <p className={styles.detailDescription}>{goal.description}</p>}

        <div className={styles.detailHero}>
          <ProgressRing value={progress} size={132} stroke={12} color={progressColor(progress)} marker={pace.status === 'done' ? null : pace.expected}>
            <strong className={styles.ringBig}>{progress}%</strong>
            <span>{getGoalProgressLabel(progress)}</span>
          </ProgressRing>
          <div className={styles.heroStats}>
            <div><span>Atual</span><strong>{formatGoalValue(current, goal.metric)}</strong></div>
            <div><span>Alvo</span><strong>{formatGoalValue(goal.targetValue, goal.metric)}</strong></div>
            <div><span>Falta</span><strong>{formatGoalValue(remaining, goal.metric)}</strong></div>
          </div>
        </div>

        <div className={styles.detailSection}>
          <div className={styles.detailSectionHeader}>
            <span>Ritmo</span>
            <PaceBadge pace={pace} />
          </div>
          <PaceTrack view={view} />
          <div className={styles.insightList}>
            {pace.projected !== null && pace.status !== 'done' && pace.status !== 'overdue' && (
              <p>
                <TrendingUp size={14} /> No ritmo atual, chega a <strong>{Math.min(pace.projected, 999)}%</strong> no prazo.
              </p>
            )}
            {perWeek !== null && remaining > 0 && (
              <p>
                <Gauge size={14} /> Precisa de <strong>{formatGoalValue(Math.ceil(perWeek), goal.metric)}</strong> por semana para bater o alvo.
              </p>
            )}
            {pace.status === 'overdue' && <p><AlertTriangle size={14} /> O prazo passou com {progress}% concluído.</p>}
            {pace.status === 'no_deadline' && <p><CalendarDays size={14} /> Defina um prazo para acompanhar o ritmo.</p>}
          </div>
        </div>

        <div className={styles.detailSection}>
          <div className={styles.detailSectionHeader}>
            <span>Plano de ação</span>
            <strong>{doneTasks}/{goal.tasks.length} concluídas</strong>
          </div>
          {goal.tasks.length > 0 && (
            <div className={styles.taskMeter}>
              {goal.tasks.map(task => <span key={task.id} className={task.completed ? styles.taskMeterDone : ''} />)}
            </div>
          )}
          <div className={styles.taskList}>
            {goal.tasks.map(task => (
              <label key={task.id} className={styles.taskItem}>
                <input type="checkbox" checked={task.completed} onChange={() => toggleTask(goal, task.id)} />
                <span className={task.completed ? styles.taskCompleted : ''}>{task.title}</span>
              </label>
            ))}
            {goal.tasks.length === 0 && <p className={styles.mutedText}>Adicione passos práticos para transformar o objetivo em execução.</p>}
          </div>
          <div className={styles.addTaskForm}>
            <input
              value={taskTitle}
              onChange={event => setTaskTitle(event.target.value)}
              placeholder="Adicionar próximo passo"
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTask(goal); } }}
            />
            <button type="button" onClick={() => addTask(goal)} title="Adicionar passo"><Plus size={16} /></button>
          </div>
        </div>

        <div className={styles.detailSection}>
          <div className={styles.detailSectionHeader}>
            <span>Relação com o funil</span>
            <strong>{goalMetricLabel(goal.metric)}</strong>
          </div>
          <div className={styles.stageChips}>
            {goal.stageIds.length ? goal.stageIds.map(stageId => {
              const stage = pipelineStages.find(item => item.id === stageId);
              return <span key={stageId} style={{ '--stage-color': stage?.color || '#6366f1' } as React.CSSProperties}>{stage?.name || stageId}</span>;
            }) : <span className={styles.mutedChip}>Todos os leads do pipeline</span>}
          </div>
        </div>

        <div className={styles.detailSection}>
          <div className={styles.detailSectionHeader}>
            <span>Quem acompanha</span>
            <strong>{goal.visibility === 'public' ? <><Eye size={14} /> Todos os usuários</> : <><Lock size={14} /> Usuários selecionados</>}</strong>
          </div>
          {goal.visibility === 'private' && (
            <div className={styles.viewerList}>
              {goal.viewerIds.length
                ? goal.viewerIds.map(viewerId => {
                  const name = users.find(item => item.id === viewerId)?.name || 'Usuário';
                  return <span key={viewerId} title={name}><i>{name.slice(0, 1).toUpperCase()}</i>{name}</span>;
                })
                : <span>Somente o criador</span>}
            </div>
          )}
        </div>

        <div className={styles.detailFooter}>
          <span><CalendarDays size={14} /> {formatDate(goal.deadline)} · {formatDaysLeft(pace.daysLeft)}</span>
          <span><Users size={14} /> {users.find(item => item.id === goal.ownerId)?.name || 'Você'}</span>
        </div>
      </aside>
    );
  };

  const totalPace = indicators.pace.on_track + indicators.pace.at_risk + indicators.pace.behind;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Metas</h1>
          <p className={styles.subtitle}>Defina o que precisa acontecer, escolha quem acompanha e monitore o avanço pelo funil.</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={startCreate}><Plus size={18} /> Nova meta</button>
      </header>

      {loadError && (
        <div className={styles.errorBanner} role="alert">
          <AlertTriangle size={16} /> {loadError}
          <button type="button" className={styles.secondaryButton} onClick={loadGoals}>Tentar novamente</button>
        </div>
      )}

      <section className={styles.indicators} aria-label="Indicadores">
        <div className={`${styles.indicatorCard} ${styles.healthCard}`}>
          <ProgressRing value={indicators.average} size={104} stroke={10} color={progressColor(indicators.average)}>
            <strong className={styles.ringMedium}>{indicators.average}%</strong>
          </ProgressRing>
          <div>
            <span className={styles.indicatorLabel}>Saúde geral</span>
            <strong className={styles.indicatorValue}>{indicators.total ? getGoalProgressLabel(indicators.average) : '—'}</strong>
            <p className={styles.indicatorHint}>Progresso médio de {indicators.total} {indicators.total === 1 ? 'meta' : 'metas'}</p>
          </div>
        </div>

        <div className={styles.indicatorCard}>
          <span className={styles.indicatorLabel}><Target size={14} /> Distribuição</span>
          <div className={styles.stackBar} aria-hidden="true">
            {indicators.total === 0
              ? <span style={{ flex: 1, background: 'var(--ring-track)' }} />
              : indicators.buckets.filter(bucket => bucket.count > 0).map(bucket => (
                <span key={bucket.key} style={{ flex: bucket.count, background: bucket.color }} title={`${bucket.label}: ${bucket.count}`} />
              ))}
          </div>
          <div className={styles.stackLegend}>
            {indicators.buckets.map(bucket => (
              <span key={bucket.key}><i style={{ background: bucket.color }} /> {bucket.label} <b>{bucket.count}</b></span>
            ))}
          </div>
        </div>

        <div className={styles.indicatorCard}>
          <span className={styles.indicatorLabel}><Gauge size={14} /> Ritmo x prazo</span>
          <div className={styles.paceColumns}>
            {[
              { label: 'No ritmo', value: indicators.pace.on_track, color: PACE_COLORS.on_track },
              { label: 'Em risco', value: indicators.pace.at_risk, color: PACE_COLORS.at_risk },
              { label: 'Atrasadas', value: indicators.pace.behind, color: PACE_COLORS.behind },
            ].map(item => (
              <div key={item.label} className={styles.paceColumn}>
                <div className={styles.paceColumnTrack}>
                  <span style={{ height: `${totalPace ? Math.max(6, (item.value / totalPace) * 100) : 6}%`, background: item.color }} />
                </div>
                <strong>{item.value}</strong>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.indicatorCard}>
          <span className={styles.indicatorLabel}><Hourglass size={14} /> Próximo prazo</span>
          {indicators.nextDeadline ? (
            <button type="button" className={styles.countdown} onClick={() => setSelectedGoalId(indicators.nextDeadline!.goal.id)}>
              <div className={styles.countdownNumber}>
                <strong>{indicators.nextDeadline.pace.daysLeft}</strong>
                <small>{indicators.nextDeadline.pace.daysLeft === 1 ? 'dia' : 'dias'}</small>
              </div>
              <div className={styles.countdownInfo}>
                <span>{indicators.nextDeadline.goal.title}</span>
                <div className={styles.miniTrack}>
                  <i style={{ width: `${indicators.nextDeadline.progress}%`, background: progressColor(indicators.nextDeadline.progress) }} />
                </div>
                <small>{indicators.nextDeadline.progress}% concluído</small>
              </div>
            </button>
          ) : (
            <p className={styles.indicatorHint}>Nenhum prazo pela frente.</p>
          )}
        </div>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.segmented}>
          {([['all', 'Todas'], ['mine', 'Criadas por mim'], ['public', 'Públicas']] as const).map(([value, label]) => (
            <button key={value} type="button" className={filter === value ? styles.segmentActive : ''} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <div className={styles.chips}>
          {([['all', 'Todos os tipos'], ['goal', 'Metas'], ['objective', 'Objetivos'], ['plan', 'Planos']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${typeFilter === value ? styles.chipActive : ''}`}
              onClick={() => setTypeFilter(value)}
            >
              {value !== 'all' && <i style={{ background: TYPE_COLORS[value] }} />}{label}
            </button>
          ))}
        </div>
        <Link href="/pipeline" className={styles.pipelineLink}><LayoutGrid size={15} /> Ver funil de vendas <ChevronRight size={15} /></Link>
      </div>

      {visibleViews.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><Flag size={28} /></div>
          <h2>{accessibleViews.length === 0 ? 'Nenhuma meta ainda' : 'Nenhuma meta neste filtro'}</h2>
          <p>
            {accessibleViews.length === 0
              ? 'Crie uma meta pública para toda a equipe ou um planejamento privado com as pessoas que vão acompanhar.'
              : 'Troque os filtros acima para ver as outras metas.'}
          </p>
          {accessibleViews.length === 0 && (
            <button type="button" className={styles.primaryButton} onClick={startCreate}><Plus size={18} /> Criar primeira meta</button>
          )}
        </div>
      ) : (
        <div className={styles.contentGrid}>
          <section className={styles.goalList} aria-label="Lista de metas">
            {visibleViews.map(view => {
              const { goal, current, progress, pace } = view;
              return (
                <button
                  type="button"
                  key={goal.id}
                  className={`${styles.goalCard} ${selected?.goal.id === goal.id ? styles.goalCardSelected : ''}`}
                  style={{ '--type-color': TYPE_COLORS[goal.type] } as React.CSSProperties}
                  onClick={() => setSelectedGoalId(goal.id)}
                >
                  <ProgressRing value={progress} size={72} stroke={7} color={progressColor(progress)} marker={pace.status === 'done' ? null : pace.expected}>
                    <strong className={styles.ringSmall}>{progress}%</strong>
                  </ProgressRing>
                  <div className={styles.goalBody}>
                    <div className={styles.goalCardHeader}>
                      <span className={styles.typeBadge}>{goalTypeLabel(goal.type)}</span>
                      <span className={styles.visibilityBadge}>
                        {goal.visibility === 'public' ? <Eye size={13} /> : <Lock size={13} />}
                        {goal.visibility === 'public' ? 'Pública' : 'Privada'}
                      </span>
                    </div>
                    <h2>{goal.title}</h2>
                    <p className={styles.goalValues}>
                      <strong>{formatGoalValue(current, goal.metric)}</strong> de {formatGoalValue(goal.targetValue, goal.metric)} · {goalMetricLabel(goal.metric)}
                    </p>
                    <div className={styles.goalFooter}>
                      <PaceBadge pace={pace} />
                      <span className={styles.deadlineChip} data-urgent={pace.daysLeft !== null && pace.daysLeft <= 7 && progress < 100 ? 'true' : undefined}>
                        <CalendarDays size={13} /> {formatDaysLeft(pace.daysLeft)}
                      </span>
                      {goal.tasks.length > 0 && (
                        <span className={styles.taskChip}><Check size={13} /> {goal.tasks.filter(task => task.completed).length}/{goal.tasks.length}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className={styles.cardChevron} />
                </button>
              );
            })}
          </section>

          {selected && renderDetail(selected)}
        </div>
      )}

      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <form className={styles.modal} onSubmit={submitGoal} onClick={event => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingGoalId ? 'Editar meta' : 'Nova meta'}</h2>
              <button type="button" className={styles.iconButton} onClick={() => setShowForm(false)} aria-label="Fechar"><X size={16} /></button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <label className={styles.fullField}>Título
                  <input required value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Ex.: Fechar 20 contratos no trimestre" />
                </label>
                <label className={styles.fullField}>Descrição
                  <textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Descreva o resultado esperado e o contexto." rows={3} />
                </label>
                <label>Tipo
                  <select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as GoalType }))}>
                    <option value="goal">Meta</option>
                    <option value="objective">Objetivo</option>
                    <option value="plan">Plano de ação</option>
                  </select>
                </label>
                <label>Métrica
                  <select value={form.metric} onChange={event => setForm(current => ({ ...current, metric: event.target.value as GoalMetric }))}>
                    <option value="won_leads">Leads ganhos</option>
                    <option value="total_leads">Leads no pipeline</option>
                    <option value="stage_leads">Leads em etapas do funil</option>
                    <option value="revenue">Receita de leads ganhos</option>
                  </select>
                </label>
                <label>Valor-alvo
                  <input required type="number" min="0.01" step="0.01" value={form.targetValue} onChange={event => setForm(current => ({ ...current, targetValue: event.target.value }))} placeholder="Ex.: 20" />
                </label>
                <label>Prazo
                  <input type="date" value={form.deadline} onChange={event => setForm(current => ({ ...current, deadline: event.target.value }))} />
                </label>
              </div>

              {form.metric === 'stage_leads' && (
                <div className={styles.formSection}>
                  <div className={styles.formSectionTitle}>Etapas consideradas</div>
                  <p>O progresso contará somente os leads que estiverem nestas etapas.</p>
                  <div className={styles.selectionGrid}>
                    {pipelineStages.map((stage: PipelineStage) => (
                      <button type="button" key={stage.id} className={form.stageIds.includes(stage.id) ? styles.selectionActive : ''} onClick={() => toggleStage(stage.id)}>
                        <span style={{ background: stage.color }} />{stage.name}{form.stageIds.includes(stage.id) && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>Visibilidade</div>
                <div className={styles.visibilityOptions}>
                  <button type="button" className={form.visibility === 'public' ? styles.visibilityOptionActive : ''} onClick={() => setForm(current => ({ ...current, visibility: 'public' }))}>
                    <Eye size={18} /><span><strong>Pública</strong><small>Todos os usuários podem acompanhar</small></span>{form.visibility === 'public' && <Check size={16} />}
                  </button>
                  <button type="button" className={form.visibility === 'private' ? styles.visibilityOptionActive : ''} onClick={() => setForm(current => ({ ...current, visibility: 'private' }))}>
                    <Lock size={18} /><span><strong>Privada</strong><small>Escolha exatamente quem tem acesso</small></span>{form.visibility === 'private' && <Check size={16} />}
                  </button>
                </div>
              </div>

              {form.visibility === 'private' && (
                <div className={styles.formSection}>
                  <div className={styles.formSectionTitle}><UserPlus size={15} /> Usuários autorizados</div>
                  <p>O criador sempre tem acesso. Marque os demais usuários que poderão ver esta meta.</p>
                  <div className={styles.userSelectionList}>
                    {users.map(viewer => (
                      <label key={viewer.id} className={styles.userSelection}>
                        <input type="checkbox" checked={form.viewerIds.includes(viewer.id)} onChange={() => toggleViewer(viewer.id)} />
                        <span className={styles.userAvatar}>{viewer.name.slice(0, 1).toUpperCase()}</span>
                        <span><strong>{viewer.name}</strong><small>{viewer.email || viewer.role || 'Usuário da equipe'}</small></span>
                        {form.viewerIds.includes(viewer.id) && <Check size={16} />}
                      </label>
                    ))}
                    {users.length === 0 && <span className={styles.mutedText}>Nenhum usuário disponível para seleção.</span>}
                  </div>
                </div>
              )}

              {formError && <div className={styles.errorBanner}><AlertTriangle size={16} /> {formError}</div>}
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className={styles.primaryButton}><Save size={16} /> {editingGoalId ? 'Salvar alterações' : 'Criar meta'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
