'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Headset, Loader2, Plus, Search } from 'lucide-react';
import styles from './suporte.module.css';
import { PRIORITY_LABEL, STAFF_STATUS_LABEL, STATUS_LABEL, ticketLabel, type SupportTicketDetail, type SupportTicketSummary } from '@/lib/support';
import { ago, api } from './format';
import TicketView from './components/TicketView';
import NewTicketModal from './components/NewTicketModal';

type View = 'open' | 'active' | 'waiting' | 'done' | 'all';
type Counts = { open: number; resolved: number; active: number; waiting: number; unassigned: number; mine: number; unread: number };
type ListResponse = { data: SupportTicketSummary[]; counts: Counts; staff: boolean; team: { id: string; name: string }[]; me: string; myPhone: string };

const CUSTOMER_TABS: { id: View; label: string; count?: keyof Counts }[] = [
  { id: 'open', label: 'Em aberto', count: 'open' },
  { id: 'done', label: 'Resolvidos' },
  { id: 'all', label: 'Todos' },
];
const STAFF_TABS: { id: View; label: string; count?: keyof Counts }[] = [
  { id: 'active', label: 'Para atender', count: 'active' },
  { id: 'waiting', label: 'Aguardando cliente', count: 'waiting' },
  { id: 'done', label: 'Resolvidos' },
  { id: 'all', label: 'Todos' },
];

/** Cliente respondeu e a Vórtice ainda não: há quanto tempo. */
function waitingSince(ticket: SupportTicketSummary) {
  if (!['open', 'in_progress'].includes(ticket.status) || !ticket.lastCustomerAt) return null;
  if (ticket.lastStaffAt && ticket.lastStaffAt >= ticket.lastCustomerAt) return null;
  return ticket.lastCustomerAt;
}

function SupportContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get('t');

  const [list, setList] = useState<ListResponse | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [mine, setMine] = useState(false);
  const [unassigned, setUnassigned] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const staff = list?.staff ?? false;
  const activeView: View = view ?? (staff ? 'active' : 'open');

  // Busca: espera a pessoa parar de digitar.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const loadList = useCallback(async () => {
    const qs = new URLSearchParams();
    if (view) qs.set('view', view);
    else qs.set('view', 'open');
    if (mine) qs.set('mine', '1');
    if (unassigned) qs.set('unassigned', '1');
    if (search) qs.set('q', search);
    try {
      const json = await api<ListResponse>(`/api/support/tickets?${qs.toString()}`);
      // Primeira carga de quem atende: troca a aba padrão para "Para atender".
      if (!view && json.staff) {
        setView('active');
        return;
      }
      setList(json);
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [view, mine, unassigned, search]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const json = await api<{ data: SupportTicketDetail }>(`/api/support/tickets/${id}`);
      setDetail(json.data);
      setDetailError('');
    } catch (error) {
      setDetail(null);
      setDetailError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void loadList(), 0);
    const timer = setInterval(() => { void loadList(); setNow(Date.now()); }, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    const first = setTimeout(() => void loadDetail(selectedId), 0);
    const timer = setInterval(() => void loadDetail(selectedId), 20_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [selectedId, loadDetail]);

  // Atalho da Central de Ajuda: /suporte?novo=1
  const wantsNew = params.get('novo') === '1';
  useEffect(() => {
    if (!wantsNew || !list || list.staff) return;
    const timer = setTimeout(() => setCreating(true), 0);
    router.replace(pathname);
    return () => clearTimeout(timer);
  }, [wantsNew, list, pathname, router]);

  const select = (id: string | null) => router.replace(id ? `${pathname}?t=${id}` : pathname);
  const shownDetail = selectedId && detail?.id === selectedId ? detail : null;

  const tabs = staff ? STAFF_TABS : CUSTOMER_TABS;
  const labels = staff ? STAFF_STATUS_LABEL : STATUS_LABEL;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1>{staff ? 'Atendimento de chamados' : 'Chamados'}</h1>
          <p>{staff ? 'Pedidos das empresas clientes: responda, mude a situação e mantenha o cliente informado.' : 'Fale com a equipe da Vórtice e acompanhe cada resposta.'}</p>
        </div>
        {list && !staff && (
          <button type="button" className={styles.primaryBtn} onClick={() => setCreating(true)}><Plus size={16} /> Abrir chamado</button>
        )}
      </header>

      {staff && list && (
        <div className={styles.stats}>
          <span className={styles.stat}><strong>{list.counts.active}</strong> para atender</span>
          <span className={`${styles.stat} ${list.counts.unassigned ? styles.statWarn : ''}`}><strong>{list.counts.unassigned}</strong> sem responsável</span>
          <span className={styles.stat}><strong>{list.counts.mine}</strong> comigo</span>
          <span className={styles.stat}><strong>{list.counts.waiting}</strong> aguardando cliente</span>
        </div>
      )}

      <div className={`${styles.layout} ${selectedId ? styles.hasDetail : ''}`}>
        <section className={styles.listPane} aria-label="Chamados">
          <div className={styles.listTools}>
            <div className={styles.tabs} role="tablist">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={activeView === tab.id} className={activeView === tab.id ? styles.tabOn : ''} onClick={() => setView(tab.id)}>
                  {tab.label}
                  {tab.count && list && list.counts[tab.count] > 0 && <span className={styles.count}>{list.counts[tab.count]}</span>}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={15} />
              <input type="search" placeholder={staff ? 'Buscar por título ou número' : 'Buscar nos seus chamados'} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {staff && (
              <div className={styles.toggles}>
                <label><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Só os meus</label>
                <label><input type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} /> Sem responsável</label>
              </div>
            )}
          </div>

          {loadError && <div className={styles.errorBox}><AlertTriangle size={15} /> {loadError}</div>}
          {!list && !loadError && <p className={styles.empty}><Loader2 size={15} className={styles.spin} /> Carregando...</p>}
          {list && list.data.length === 0 && (
            <div className={styles.emptyState}>
              <Headset size={30} />
              <p>{search ? 'Nenhum chamado com essa busca.' : staff ? 'Nenhum chamado aqui. 🎉' : activeView === 'open' ? 'Você não tem chamados em aberto.' : 'Nenhum chamado ainda.'}</p>
              {!staff && <button type="button" className={styles.secondaryBtn} onClick={() => setCreating(true)}><Plus size={15} /> Abrir chamado</button>}
            </div>
          )}

          <ul className={styles.items}>
            {list?.data.map((ticket) => {
              const waiting = staff ? waitingSince(ticket) : null;
              return (
                <li key={ticket.id}>
                  <button type="button" className={`${styles.item} ${selectedId === ticket.id ? styles.itemOn : ''} ${ticket.unread ? styles.itemUnread : ''}`} onClick={() => select(ticket.id)}>
                    <span className={styles.itemTop}>
                      <span className={styles.code}>{ticketLabel(ticket.code)}</span>
                      {ticket.unread && <span className={styles.dot} aria-label="Novidade" />}
                      <span className={styles.itemTime}>{ago(ticket.updatedAt, now)}</span>
                    </span>
                    <strong className={styles.itemSubject}>{ticket.subject}</strong>
                    <span className={styles.itemMeta}>
                      {staff ? `${ticket.tenantName} · ${ticket.openedByName}` : ticket.openedByName}
                    </span>
                    <span className={styles.itemBadges}>
                      <span className={`${styles.status} ${styles[`st_${ticket.status}`]}`}>{labels[ticket.status]}</span>
                      {(staff || ticket.priority === 'urgent') && ticket.priority !== 'normal' && (
                        <span className={`${styles.priority} ${styles[`pr_${ticket.priority}`]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
                      )}
                      {staff && <span className={styles.assignee}>{ticket.assignedName || 'Sem responsável'}</span>}
                      {waiting && <span className={styles.waitingTag}>sem resposta {ago(waiting, now)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className={styles.detailPane}>
          {shownDetail ? (
            <TicketView
              key={shownDetail.id}
              ticket={shownDetail}
              staff={staff}
              me={list?.me || ''}
              team={list?.team || []}
              onBack={() => select(null)}
              onChanged={async () => { await Promise.all([loadDetail(shownDetail.id), loadList()]); }}
              onNew={() => setCreating(true)}
            />
          ) : selectedId && detailError ? (
            <div className={styles.placeholder}><AlertTriangle size={26} /><p>{detailError}</p><button type="button" className={styles.linkBtn} onClick={() => select(null)}>Voltar para a lista</button></div>
          ) : selectedId ? (
            <div className={styles.placeholder}><Loader2 size={22} className={styles.spin} /></div>
          ) : (
            <div className={styles.placeholder}>
              <Headset size={34} />
              <p>{staff ? 'Escolha um chamado para responder.' : 'Escolha um chamado para ver a conversa.'}</p>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <NewTicketModal
          defaultPhone={list?.myPhone || ''}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setView('open');
            select(id);
            void loadList();
          }}
        />
      )}
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportContent />
    </Suspense>
  );
}
