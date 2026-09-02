"use client";

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Eye,
  Filter,
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
  getGoalProgress,
  getGoalProgressLabel,
  goalMetricLabel,
  goalTypeLabel,
  GOALS_STORAGE_KEY,
  readGoals,
  type GoalMetric,
  type GoalPlan,
  type GoalTask,
  type GoalType,
  type GoalVisibility,
} from '@/lib/goals';

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

const makeId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const formatDate = (date?: string) => {
  if (!date) return 'Sem prazo definido';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Sem prazo definido' : parsed.toLocaleDateString('pt-BR');
};

const getDaysRemaining = (date?: string) => {
  if (!date) return null;
  const deadline = new Date(`${date}T23:59:59`).getTime();
  if (Number.isNaN(deadline)) return null;
  return Math.ceil((deadline - Date.now()) / 86_400_000);
};

const getGoalStatusClass = (progress: number) => progress >= 100
  ? styles.progressComplete
  : progress >= 75
    ? styles.progressNear
    : progress >= 40
      ? styles.progressOnTrack
      : styles.progressAttention;

function ProgressBar({ goal, leads }: { goal: GoalPlan; leads: ReturnType<typeof useLeads>['leads'] }) {
  const current = getGoalCurrentValue(goal, leads);
  const progress = getGoalProgress(goal, leads);
  const days = getDaysRemaining(goal.deadline);

  return (
    <div className={styles.progressBlock}>
      <div className={styles.progressMeta}>
        <span>{formatGoalValue(current, goal.metric)} de {formatGoalValue(goal.targetValue, goal.metric)}</span>
        <strong className={getGoalStatusClass(progress)}>{progress}% · {getGoalProgressLabel(progress)}</strong>
      </div>
      <div className={styles.progressTrack}><span className={getGoalStatusClass(progress)} style={{ width: `${progress}%` }} /></div>
      <div className={styles.progressFooter}>
        <span>{goalMetricLabel(goal.metric)}</span>
        <span>{days === null ? 'Sem prazo' : days < 0 ? `Atrasada há ${Math.abs(days)} dias` : days === 0 ? 'Vence hoje' : `${days} dias restantes`}</span>
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
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'public'>('all');
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);
  const [taskTitle, setTaskTitle] = useState('');
  const [formError, setFormError] = useState('');
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    const storedGoals = readGoals();
    // Browser localStorage is the source for this module until a goals table is connected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoals(storedGoals);
    setHydrated(true);

    const refreshGoals = () => setGoals(readGoals());
    window.addEventListener('storage', refreshGoals);
    window.addEventListener('vortice-goals-updated', refreshGoals);
    return () => {
      window.removeEventListener('storage', refreshGoals);
      window.removeEventListener('vortice-goals-updated', refreshGoals);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchUsers = async () => {
      if (supabase) {
        const { data } = await supabase.from('profiles').select('id,name,email,role').order('name');
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

  const persistGoals = (nextGoals: GoalPlan[]) => {
    setGoals(nextGoals);
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(nextGoals));
    window.dispatchEvent(new Event('vortice-goals-updated'));
  };

  const visibleGoals = useMemo(() => goals
    .filter(goal => canViewGoal(goal, user?.id, isAdmin))
    .filter(goal => filter === 'all' || (filter === 'mine' ? goal.ownerId === user?.id : goal.visibility === 'public'))
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')), [filter, goals, isAdmin, user?.id]);

  const selectedGoal = visibleGoals.find(goal => goal.id === selectedGoalId) || visibleGoals[0];
  const nearGoals = visibleGoals.filter(goal => getGoalProgress(goal, leads) >= 75 && getGoalProgress(goal, leads) < 100).length;
  const completedGoals = visibleGoals.filter(goal => getGoalProgress(goal, leads) >= 100).length;
  const privateGoals = visibleGoals.filter(goal => goal.visibility === 'private').length;

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

  const submitGoal = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const title = form.title.trim();
    const targetValue = Number(form.targetValue.replace(',', '.'));
    if (!title) return setFormError('Informe um título para o planejamento.');
    if (!Number.isFinite(targetValue) || targetValue <= 0) return setFormError('Informe um valor-alvo maior que zero.');
    if (form.metric === 'stage_leads' && form.stageIds.length === 0) return setFormError('Escolha ao menos uma etapa do funil.');

    const now = new Date().toISOString();
    if (editingGoalId) {
      persistGoals(goals.map(goal => goal.id === editingGoalId ? {
        ...goal,
        title,
        description: form.description.trim(),
        type: form.type,
        metric: form.metric,
        targetValue,
        deadline: form.deadline,
        stageIds: form.stageIds,
        visibility: form.visibility,
        viewerIds: form.visibility === 'public' ? [] : form.viewerIds,
        updatedAt: now,
      } : goal));
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
        createdAt: now,
        updatedAt: now,
      };
      persistGoals([newGoal, ...goals]);
      setSelectedGoalId(newGoal.id);
    }
    setShowForm(false);
  };

  const deleteGoal = (goal: GoalPlan) => {
    if (!window.confirm(`Excluir “${goal.title}”?`)) return;
    persistGoals(goals.filter(item => item.id !== goal.id));
    setSelectedGoalId(null);
  };

  const toggleTask = (goal: GoalPlan, taskId: string) => {
    persistGoals(goals.map(item => item.id === goal.id ? {
      ...item,
      tasks: item.tasks.map(task => task.id === taskId ? { ...task, completed: !task.completed } : task),
      updatedAt: new Date().toISOString(),
    } : item));
  };

  const addTask = (goal: GoalPlan) => {
    const title = taskTitle.trim();
    if (!title) return;
    const task: GoalTask = { id: makeId('task'), title, completed: false };
    persistGoals(goals.map(item => item.id === goal.id ? { ...item, tasks: [...item.tasks, task], updatedAt: new Date().toISOString() } : item));
    setTaskTitle('');
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
    return <div className={styles.loadingState}>Carregando metas e objetivos...</div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PLANEJAMENTO E PERFORMANCE</span>
          <h1>Metas, objetivos e planos</h1>
          <p>Defina o que precisa acontecer, escolha quem acompanha e monitore o avanço pelo funil.</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={startCreate}><Plus size={17} /> Novo planejamento</button>
      </header>

      <section className={styles.summaryGrid} aria-label="Resumo das metas">
        <div className={styles.summaryCard}><div className={styles.summaryIcon}><Target size={18} /></div><div><span>Visíveis para você</span><strong>{visibleGoals.length}</strong></div></div>
        <div className={styles.summaryCard}><div className={`${styles.summaryIcon} ${styles.summaryIconGreen}`}><TrendingUp size={18} /></div><div><span>Próximas do alvo</span><strong>{nearGoals}</strong></div></div>
        <div className={styles.summaryCard}><div className={`${styles.summaryIcon} ${styles.summaryIconBlue}`}><Check size={18} /></div><div><span>Concluídas</span><strong>{completedGoals}</strong></div></div>
        <div className={styles.summaryCard}><div className={`${styles.summaryIcon} ${styles.summaryIconOrange}`}><Lock size={18} /></div><div><span>Privadas acompanhadas</span><strong>{privateGoals}</strong></div></div>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.filterLabel}><Filter size={15} /> Visualização</div>
        <div className={styles.filterGroup}>
          <button type="button" className={filter === 'all' ? styles.filterActive : ''} onClick={() => setFilter('all')}>Todas</button>
          <button type="button" className={filter === 'mine' ? styles.filterActive : ''} onClick={() => setFilter('mine')}>Criadas por mim</button>
          <button type="button" className={filter === 'public' ? styles.filterActive : ''} onClick={() => setFilter('public')}>Públicas</button>
        </div>
        <Link href="/pipeline" className={styles.pipelineLink}><LayoutGrid size={14} /> Ver funil de vendas <ChevronRight size={14} /></Link>
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.goalList} aria-label="Lista de metas">
          {visibleGoals.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}><Target size={22} /></div>
              <h2>Nenhum planejamento visível</h2>
              <p>Crie uma meta pública ou defina os usuários que poderão acompanhar um planejamento privado.</p>
              <button type="button" className={styles.primaryButton} onClick={startCreate}><Plus size={16} /> Criar primeiro planejamento</button>
            </div>
          ) : visibleGoals.map(goal => {
            return (
              <button type="button" key={goal.id} className={`${styles.goalCard} ${selectedGoal?.id === goal.id ? styles.goalCardSelected : ''}`} onClick={() => setSelectedGoalId(goal.id)}>
                <div className={styles.goalCardHeader}>
                  <span className={styles.typeBadge}>{goalTypeLabel(goal.type)}</span>
                  <span className={styles.visibilityBadge}>{goal.visibility === 'public' ? <Eye size={13} /> : <Lock size={13} />}{goal.visibility === 'public' ? 'Público' : 'Privado'}</span>
                </div>
                <h2>{goal.title}</h2>
                <p>{goal.description || 'Sem descrição adicionada.'}</p>
                <ProgressBar goal={goal} leads={leads} />
                <div className={styles.cardBottom}><span>{goal.stageIds.length ? `${goal.stageIds.length} etapas do funil` : 'Funil completo'}</span><ChevronRight size={15} /></div>
              </button>
            );
          })}
        </section>

        {selectedGoal && (
          <aside className={styles.detailPanel} aria-label="Detalhes do planejamento">
            <div className={styles.detailHeader}>
              <div><span className={styles.eyebrow}>{goalTypeLabel(selectedGoal.type).toUpperCase()}</span><h2>{selectedGoal.title}</h2></div>
              <div className={styles.detailActions}><button type="button" onClick={() => startEdit(selectedGoal)} title="Editar planejamento"><Pencil size={15} /></button><button type="button" onClick={() => deleteGoal(selectedGoal)} title="Excluir planejamento"><Trash2 size={15} /></button></div>
            </div>
            <p className={styles.detailDescription}>{selectedGoal.description || 'Sem descrição adicionada.'}</p>
            <ProgressBar goal={selectedGoal} leads={leads} />

            <div className={styles.detailSection}><div className={styles.detailSectionHeader}><span>ALCANCE</span><strong>{selectedGoal.visibility === 'public' ? <><Eye size={14} /> Todos os usuários</> : <><Lock size={14} /> Usuários selecionados</>}</strong></div>{selectedGoal.visibility === 'private' && <div className={styles.viewerList}>{selectedGoal.viewerIds.length ? selectedGoal.viewerIds.map(viewerId => <span key={viewerId}>{users.find(item => item.id === viewerId)?.name || 'Usuário selecionado'}</span>) : <span>Somente o criador</span>}</div>}</div>

            <div className={styles.detailSection}><div className={styles.detailSectionHeader}><span>RELAÇÃO COM O FUNIL</span><strong>{selectedGoal.metric === 'stage_leads' ? 'Etapas selecionadas' : 'Todas as etapas'}</strong></div><div className={styles.stageChips}>{selectedGoal.stageIds.length ? selectedGoal.stageIds.map(stageId => <span key={stageId} style={{ '--stage-color': pipelineStages.find(stage => stage.id === stageId)?.color || '#6366f1' } as React.CSSProperties}>{pipelineStages.find(stage => stage.id === stageId)?.name || stageId}</span>) : <span className={styles.mutedChip}>Todos os leads do pipeline</span>}</div></div>

            <div className={styles.detailSection}><div className={styles.detailSectionHeader}><span>PLANO DE AÇÃO</span><strong>{selectedGoal.tasks.filter(task => task.completed).length}/{selectedGoal.tasks.length} concluídas</strong></div><div className={styles.taskList}>{selectedGoal.tasks.map(task => <label key={task.id} className={styles.taskItem}><input type="checkbox" checked={task.completed} onChange={() => toggleTask(selectedGoal, task.id)} /><span className={task.completed ? styles.taskCompleted : ''}>{task.title}</span></label>)}{selectedGoal.tasks.length === 0 && <p className={styles.emptyTasks}>Adicione passos práticos para transformar o objetivo em execução.</p>}</div><div className={styles.addTaskForm}><input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="Adicionar próximo passo" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTask(selectedGoal); } }} /><button type="button" onClick={() => addTask(selectedGoal)} title="Adicionar passo"><Plus size={15} /></button></div></div>

            <div className={styles.detailFooter}><span><CalendarDays size={14} /> Prazo: {formatDate(selectedGoal.deadline)}</span><span><Users size={14} /> Criado por: {users.find(item => item.id === selectedGoal.ownerId)?.name || 'Você'}</span></div>
          </aside>
        )}
      </div>

      {showForm && <div className={styles.modalOverlay} onClick={() => setShowForm(false)}><form className={styles.modal} onSubmit={submitGoal} onClick={event => event.stopPropagation()}><div className={styles.modalHeader}><div><span className={styles.eyebrow}>{editingGoalId ? 'EDITAR PLANEJAMENTO' : 'NOVO PLANEJAMENTO'}</span><h2>{editingGoalId ? 'Atualizar meta, objetivo ou plano' : 'Criar planejamento'}</h2></div><button type="button" className={styles.iconButton} onClick={() => setShowForm(false)}><X size={17} /></button></div><div className={styles.formGrid}><label className={styles.fullField}>Título<input required value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Ex.: Fechar 20 contratos no trimestre" /></label><label className={styles.fullField}>Descrição<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Descreva o resultado esperado e o contexto." rows={3} /></label><label>Tipo<select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as GoalType }))}><option value="goal">Meta</option><option value="objective">Objetivo</option><option value="plan">Plano de ação</option></select></label><label>Métrica<select value={form.metric} onChange={event => setForm(current => ({ ...current, metric: event.target.value as GoalMetric }))}><option value="won_leads">Leads ganhos</option><option value="total_leads">Leads no pipeline</option><option value="stage_leads">Leads em etapas do funil</option><option value="revenue">Receita de leads ganhos</option></select></label><label>Valor-alvo<input required type="number" min="0.01" step="0.01" value={form.targetValue} onChange={event => setForm(current => ({ ...current, targetValue: event.target.value }))} placeholder="Ex.: 20" /></label><label>Prazo<input type="date" value={form.deadline} onChange={event => setForm(current => ({ ...current, deadline: event.target.value }))} /></label></div>

        {form.metric === 'stage_leads' && <div className={styles.formSection}><div className={styles.formSectionTitle}>Etapas consideradas</div><p>O progresso contará somente os leads que estiverem nestas etapas.</p><div className={styles.selectionGrid}>{pipelineStages.map((stage: PipelineStage) => <button type="button" key={stage.id} className={form.stageIds.includes(stage.id) ? styles.selectionActive : ''} onClick={() => toggleStage(stage.id)}><span style={{ background: stage.color }} />{stage.name}{form.stageIds.includes(stage.id) && <Check size={14} />}</button>)}</div></div>}

        <div className={styles.formSection}><div className={styles.formSectionTitle}>Visibilidade</div><div className={styles.visibilityOptions}><button type="button" className={form.visibility === 'public' ? styles.visibilityOptionActive : ''} onClick={() => setForm(current => ({ ...current, visibility: 'public' }))}><Eye size={16} /><span><strong>Público</strong><small>Todos os usuários poderão acompanhar</small></span>{form.visibility === 'public' && <Check size={15} />}</button><button type="button" className={form.visibility === 'private' ? styles.visibilityOptionActive : ''} onClick={() => setForm(current => ({ ...current, visibility: 'private' }))}><Lock size={16} /><span><strong>Privado</strong><small>Escolha exatamente quem terá acesso</small></span>{form.visibility === 'private' && <Check size={15} />}</button></div></div>

        {form.visibility === 'private' && <div className={styles.formSection}><div className={styles.formSectionTitle}><UserPlus size={15} /> Usuários autorizados</div><p>O criador sempre terá acesso. Marque os demais usuários que poderão visualizar este planejamento.</p><div className={styles.userSelectionList}>{users.map(viewer => <label key={viewer.id} className={styles.userSelection}><input type="checkbox" checked={form.viewerIds.includes(viewer.id)} onChange={() => toggleViewer(viewer.id)} /><span className={styles.userAvatar}>{viewer.name.slice(0, 1).toUpperCase()}</span><span><strong>{viewer.name}</strong><small>{viewer.email || viewer.role || 'Usuário da equipe'}</small></span>{form.viewerIds.includes(viewer.id) && <Check size={15} />}</label>)}{users.length === 0 && <span className={styles.noUsers}>Nenhum usuário disponível para seleção.</span>}</div></div>}

        {formError && <div className={styles.formError}>{formError}</div>}
        <div className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className={styles.primaryButton}><Save size={15} /> {editingGoalId ? 'Salvar alterações' : 'Criar planejamento'}</button></div>
      </form></div>}
    </div>
  );
}
