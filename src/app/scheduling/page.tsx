'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarDays, CheckCircle2, KanbanSquare, Plus, Send, X } from 'lucide-react';
import styles from './scheduling.module.css';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import { usePermissions } from '@/lib/permissions';
import { useTeam } from '@/components/leads/useTeam';
import type { QuickReply } from '@/app/messages/types';
import { api, isOverdue, monthCells, sortItems, ymd, type AgendaItem, type ItemStatus, type ItemType, type ScheduledSend, type Tab } from './format';
import CalendarView from './components/CalendarView';
import TaskBoard from './components/TaskBoard';
import SendsView from './components/SendsView';
import ItemModal from './components/ItemModal';

type ModalState = { item: AgendaItem | null; type: ItemType; date: string } | null;
type Toast = { type: 'ok' | 'error'; text: string } | null;

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'agenda', label: 'Agenda', icon: <CalendarDays size={16} /> },
  { id: 'tasks', label: 'Tarefas', icon: <KanbanSquare size={16} /> },
  { id: 'sends', label: 'Envios agendados', icon: <Send size={16} /> },
];

function SchedulingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { leads } = useLeads();
  const team = useTeam();

  const meId = user?.id || '';
  const canAssign = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const hasCrm = !user?.workspace || user.workspace.modules.includes('crm');
  const canUseReplies = hasPermission('messages.templates');
  const tabs = TABS.filter((tab) => tab.id !== 'sends' || hasCrm);
  const requestedTab = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((item) => item.id === requestedTab) ? (requestedTab as Tab) : 'agenda';

  const [todayKey] = useState(() => ymd(new Date()));
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [tasks, setTasks] = useState<AgendaItem[]>([]);
  const [sends, setSends] = useState<ScheduledSend[]>([]);
  const [loaded, setLoaded] = useState({ month: false, tasks: false, sends: false });
  const [workerEnabled, setWorkerEnabled] = useState(true);
  const [whatsappReady, setWhatsappReady] = useState<boolean | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<Toast>(null);

  const say = useCallback((type: 'ok' | 'error', text: string) => setToast({ type, text }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const range = useMemo(() => {
    const cells = monthCells(month);
    return { from: cells[0].key, to: cells[cells.length - 1].key };
  }, [month]);

  const loadMonth = useCallback(async () => {
    try {
      const json = await api<{ data: AgendaItem[] }>(`/api/scheduling/items?from=${range.from}&to=${range.to}`);
      setItems(json.data);
    } catch (error) {
      say('error', (error as Error).message);
    } finally {
      setLoaded((value) => ({ ...value, month: true }));
    }
  }, [range, say]);

  const loadTasks = useCallback(async () => {
    try {
      const json = await api<{ data: AgendaItem[] }>('/api/scheduling/items?tasks=1');
      setTasks(json.data);
    } catch (error) {
      say('error', (error as Error).message);
    } finally {
      setLoaded((value) => ({ ...value, tasks: true }));
    }
  }, [say]);

  const loadSends = useCallback(async () => {
    try {
      const json = await api<{ data: ScheduledSend[]; workerEnabled: boolean }>('/api/scheduling/sends');
      setSends(json.data);
      setWorkerEnabled(json.workerEnabled);
    } catch (error) {
      say('error', (error as Error).message);
    } finally {
      setLoaded((value) => ({ ...value, sends: true }));
    }
  }, [say]);

  useEffect(() => { void loadMonth(); }, [loadMonth]);
  // A versão antiga guardava a agenda no navegador (sem separar empresa/usuário).
  useEffect(() => { try { localStorage.removeItem('vortice_scheduling_items'); } catch {} }, []);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => {
    if (!hasCrm) return;
    void loadSends();
    fetch('/api/messages/channel', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => json?.data && setWhatsappReady(Boolean(json.data.web || json.data.api)))
      .catch(() => undefined);
    if (canUseReplies) {
      fetch('/api/messages/templates', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => setQuickReplies(Array.isArray(json?.templates) ? json.templates : []))
        .catch(() => undefined);
    }
  }, [hasCrm, canUseReplies, loadSends]);

  // Envio saindo (ou para os próximos minutos): atualiza a lista até sair.
  useEffect(() => {
    const soon = Date.now() + 120_000;
    const active = sends.some((send) => send.status === 'sending' || (send.status === 'pending' && send.sendAt && new Date(send.sendAt).getTime() < soon));
    if (tab !== 'sends' || !active) return;
    const timer = setInterval(() => void loadSends(), 20_000);
    return () => clearInterval(timer);
  }, [tab, sends, loadSends]);

  // Link do lembrete no sino: /scheduling?item=<id>
  const linkedItem = params.get('item');
  useEffect(() => {
    if (!linkedItem) return;
    let alive = true;
    api<{ data: AgendaItem[] }>(`/api/scheduling/items?id=${encodeURIComponent(linkedItem)}`)
      .then((json) => {
        if (!alive) return;
        const found = json.data[0];
        if (found) {
          setMonth(new Date(Number(found.date.slice(0, 4)), Number(found.date.slice(5, 7)) - 1, 1));
          setModal({ item: found, type: found.type, date: found.date });
        } else {
          say('error', 'Esse item não existe mais ou não está com você.');
        }
        // Tira o ?item= do endereço (recarregar não reabre a janela).
        window.history.replaceState(null, '', pathname);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [linkedItem, pathname, say]);

  const setTab = (next: Tab) => router.replace(next === 'agenda' ? pathname : `${pathname}?tab=${next}`);

  const ownerName = useCallback((id: string | null) => {
    if (!id) return null;
    if (id === meId) return 'Você';
    return team.find((member) => member.id === id)?.name || null;
  }, [team, meId]);

  const mine = (item: AgendaItem) => item.assignedTo === meId || (!item.assignedTo && item.createdBy === meId);
  const visibleItems = onlyMine ? items.filter(mine) : items;
  const visibleTasks = onlyMine ? tasks.filter(mine) : tasks;
  const canEdit = (item: AgendaItem) => canAssign || item.createdBy === meId || item.assignedTo === meId || (!item.assignedTo && !item.createdBy);

  const todayCount = items.filter((item) => item.date === todayKey && item.status !== 'done').length;
  const lateCount = tasks.filter((item) => isOverdue(item, todayKey)).length;
  const pendingSends = sends.filter((send) => send.status === 'pending').length;

  const refreshAgenda = () => Promise.all([loadMonth(), loadTasks()]);

  const saveItem = async (payload: Record<string, unknown>) => {
    try {
      if (modal?.item) {
        await api(`/api/scheduling/items/${modal.item.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        say('ok', 'Alterações salvas.');
      } else {
        await api('/api/scheduling/items', { method: 'POST', body: JSON.stringify(payload) });
        say('ok', payload.type === 'task' ? 'Tarefa criada.' : 'Compromisso marcado.');
      }
      setModal(null);
      await refreshAgenda();
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };

  const deleteItem = async () => {
    if (!modal?.item) return null;
    try {
      await api(`/api/scheduling/items/${modal.item.id}`, { method: 'DELETE' });
      setModal(null);
      say('ok', 'Excluído.');
      await refreshAgenda();
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };

  const moveTask = async (task: AgendaItem, status: ItemStatus) => {
    const update = (list: AgendaItem[]) => list.map((item) => (item.id === task.id ? { ...item, status } : item));
    setTasks(update);
    setItems(update);
    try {
      await api(`/api/scheduling/items/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (error) {
      say('error', (error as Error).message);
      await refreshAgenda();
    }
  };

  const createSend = async (payload: Record<string, unknown>) => {
    try {
      await api('/api/scheduling/sends', { method: 'POST', body: JSON.stringify(payload) });
      say('ok', 'Mensagem agendada.');
      await loadSends();
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };

  const updateSend = async (id: string, payload: Record<string, unknown>) => {
    try {
      await api(`/api/scheduling/sends/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      say('ok', 'Envio atualizado.');
      await loadSends();
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };

  const cancelSend = async (send: ScheduledSend) => {
    try {
      await api(`/api/scheduling/sends/${send.id}`, { method: 'DELETE' });
      say('ok', 'Envio cancelado.');
    } catch (error) {
      say('error', (error as Error).message);
    }
    await loadSends();
  };

  const openNew = (type: ItemType, date?: string) => {
    const monthKey = ymd(month).slice(0, 7);
    setModal({ item: null, type, date: date || (todayKey.startsWith(monthKey) ? todayKey : ymd(month)) });
  };

  const leadOptions = useMemo(
    () => [...leads].map((lead) => ({ id: lead.id, name: lead.name, phone: lead.phone || '' })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [leads],
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1>Agendamento</h1>
          <p>Compromissos, tarefas e mensagens com dia e hora marcados.</p>
        </div>
        {tab !== 'sends' && (
          <div className={styles.headerActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => openNew('task')}><Plus size={16} /> Tarefa</button>
            <button type="button" className={styles.primaryBtn} onClick={() => openNew('event')}><Plus size={16} /> Compromisso</button>
          </div>
        )}
      </header>

      <div className={styles.stats}>
        <span className={styles.stat}><CalendarDays size={15} /> <strong>{todayCount}</strong> hoje</span>
        <button type="button" className={`${styles.stat} ${lateCount ? styles.statBad : ''}`} onClick={() => setTab('tasks')}>
          <AlertCircle size={15} /> <strong>{lateCount}</strong> {lateCount === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
        </button>
        {hasCrm && (
          <button type="button" className={styles.stat} onClick={() => setTab('sends')}>
            <Send size={15} /> <strong>{pendingSends}</strong> {pendingSends === 1 ? 'envio agendado' : 'envios agendados'}
          </button>
        )}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist">
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? styles.tabOn : ''} onClick={() => setTab(item.id)}>
              {item.icon} <span>{item.label}</span>
            </button>
          ))}
        </div>
        {tab !== 'sends' && (
          <div className={styles.filters} role="group" aria-label="Filtro">
            <button type="button" className={!onlyMine ? styles.filterOn : ''} onClick={() => setOnlyMine(false)}>{canAssign ? 'Equipe' : 'Todos'}</button>
            <button type="button" className={onlyMine ? styles.filterOn : ''} onClick={() => setOnlyMine(true)}>Meus</button>
          </div>
        )}
      </div>

      {tab === 'agenda' && (
        <CalendarView
          month={month}
          items={sortItems(visibleItems)}
          todayKey={todayKey}
          loaded={loaded.month}
          ownerName={ownerName}
          onMonth={(offset) => setMonth((current) => {
            if (offset === 'today') { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); }
            return new Date(current.getFullYear(), current.getMonth() + offset, 1);
          })}
          onDay={(key) => setModal({ item: null, type: 'event', date: key })}
          onItem={(item) => setModal({ item, type: item.type, date: item.date })}
        />
      )}

      {tab === 'tasks' && (
        <TaskBoard
          tasks={sortItems(visibleTasks)}
          todayKey={todayKey}
          loaded={loaded.tasks}
          ownerName={ownerName}
          canMove={canEdit}
          onMove={moveTask}
          onItem={(item) => setModal({ item, type: item.type, date: item.date })}
        />
      )}

      {tab === 'sends' && hasCrm && (
        <SendsView
          sends={sends}
          leads={leadOptions}
          loaded={loaded.sends}
          todayKey={todayKey}
          workerEnabled={workerEnabled}
          whatsappReady={whatsappReady}
          isAdmin={user?.role === 'ADMIN'}
          quickReplies={quickReplies}
          agentName={user?.name?.split(' ')[0] || ''}
          initialLeadId={params.get('lead')}
          onCreate={createSend}
          onUpdate={updateSend}
          onCancel={cancelSend}
        />
      )}

      {modal && (
        <ItemModal
          key={modal.item?.id || `new-${modal.type}-${modal.date}`}
          item={modal.item}
          defaults={{ type: modal.type, date: modal.date }}
          leads={leadOptions}
          team={team}
          meId={meId}
          canAssign={canAssign}
          canEdit={!modal.item || canEdit(modal.item)}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={() => setModal(null)}
        />
      )}

      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`} role="status">
          {toast.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Fechar aviso"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

export default function SchedulingPage() {
  return (
    <Suspense fallback={null}>
      <SchedulingContent />
    </Suspense>
  );
}
