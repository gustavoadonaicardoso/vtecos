import { Ban, Menu, Search, UserPlus } from 'lucide-react';
import styles from '../messages.module.css';
import type { Lead } from '@/types';
import type { InboxTab } from '../types';
import { initials, listTime } from '../format';

interface ConversationListProps {
  hidden: boolean;
  conversations: Lead[];
  counts: Record<InboxTab, number>;
  tab: InboxTab;
  onTab: (tab: InboxTab) => void;
  query: string;
  onQuery: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canAssign: boolean;
  ownerName: (id?: string | null) => string | null;
  canCreate: boolean;
  onNewContact: () => void;
  now: number;
  loaded: boolean;
  /** Celular: abre o menu lateral (a barra de cima fica escondida nesta tela). */
  onMenu: () => void;
}

export default function ConversationList(props: ConversationListProps) {
  const { hidden, conversations, counts, tab, onTab, query, onQuery, selectedId, onSelect, canAssign, ownerName, canCreate, onNewContact, now, loaded, onMenu } = props;
  const tabs: [InboxTab, string][] = [
    ['all', 'Todas'],
    ['unread', 'Não lidas'],
    ['mine', 'Minhas'],
    ...(canAssign ? [['unassigned', 'Sem responsável'] as [InboxTab, string]] : []),
  ];

  return (
    <aside className={`${styles.list} ${hidden ? styles.hideMobile : ''}`} aria-label="Conversas">
      <div className={styles.listHead}>
        <div className={styles.listTitle}>
          <button type="button" className={`${styles.iconBtn} ${styles.menuBtn}`} onClick={onMenu} aria-label="Abrir menu"><Menu size={20} /></button>
          <h1>Mensagens</h1>
          {canCreate && (
            <button type="button" className={styles.newBtn} onClick={onNewContact} title="Novo contato">
              <UserPlus size={15} /> Novo
            </button>
          )}
        </div>
        <label className={styles.search}>
          <Search size={15} />
          <input type="search" placeholder="Buscar por nome ou telefone" value={query} onChange={(e) => onQuery(e.target.value)} />
        </label>
        <div className={styles.tabs} role="tablist">
          {tabs.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? styles.tabOn : ''} onClick={() => onTab(value)}>
              {label}
              {value !== 'all' && counts[value] > 0 && <span className={styles.tabCount}>{counts[value]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.items}>
        {!loaded && <p className={styles.muted}>Carregando conversas...</p>}
        {loaded && conversations.length === 0 && (
          <p className={styles.muted}>{query ? 'Ninguém com esse nome ou telefone.' : tab === 'unread' ? 'Nenhuma mensagem nova. 🎉' : 'Nenhuma conversa aqui.'}</p>
        )}
        {conversations.map((lead) => {
          const unread = lead.unreadCount ?? 0;
          const owner = canAssign ? ownerName(lead.assignedTo) : null;
          return (
            <button key={lead.id} type="button" className={`${styles.item} ${selectedId === lead.id ? styles.itemOn : ''} ${unread > 0 ? styles.itemUnread : ''}`} onClick={() => onSelect(lead.id)}>
              <span className={styles.avatar}>{initials(lead.name)}</span>
              <span className={styles.itemBody}>
                <span className={styles.itemTop}>
                  <strong>{lead.name}</strong>
                  <time>{listTime(lead.lastActivityAt || lead.createdAt, now)}</time>
                </span>
                <span className={styles.itemBottom}>
                  <span className={styles.preview}>
                    {lead.status === 'Bloqueado' && <Ban size={11} className={styles.blockedIcon} aria-label="Bloqueado" />}
                    {lead.lastMsg || lead.phone || 'Sem mensagens'}
                  </span>
                  {unread > 0 && <span className={styles.unread}>{unread > 99 ? '99+' : unread}</span>}
                </span>
                {canAssign && <span className={`${styles.owner} ${owner ? '' : styles.ownerNone}`}>{owner || 'Sem responsável'}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
