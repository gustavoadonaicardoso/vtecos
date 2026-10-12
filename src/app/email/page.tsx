'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, FileText, Inbox, Loader2, Mail, Paperclip, PenSquare, RefreshCw, Search, Send, Settings2, Star, Trash2, User, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatAddress, formatAddressList, forwardSubject, replyAllRecipients, replySubject } from '@/lib/email/format';
import styles from './email.module.css';
import Reader from './components/Reader';
import Composer from './components/Composer';
import AccountsModal from './components/AccountsModal';
import TemplatesModal from './components/TemplatesModal';
import { api, FOLDER_LABEL, jsonInit, shortDate, type Account, type ComposeDraft, type Folder, type MessageFull, type MessageItem, type Template, type Thread } from './types';

const FOLDERS: { key: Folder; icon: typeof Inbox }[] = [
  { key: 'inbox', icon: Inbox },
  { key: 'sent', icon: Send },
  { key: 'starred', icon: Star },
  { key: 'trash', icon: Trash2 },
];

interface ListState {
  /** De qual caixa/pasta/busca é esta lista (trocar o filtro mostra "carregando" até chegar a nova). */
  key: string;
  items: MessageItem[];
  total: number;
  page: number;
}

function EmailPage() {
  const { user } = useAuth();
  const params = useSearchParams();
  const canShared = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [list, setList] = useState<ListState | null>(null);
  const [listError, setListError] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');

  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const listRequest = useRef(0);

  const openedFromLink = useRef(false);
  const listKey = `${accountFilter}|${folder}|${query}`;

  const loadAccounts = useCallback(async () => {
    let data: Account[];
    try {
      data = await api<Account[]>('/api/email/accounts');
    } catch (err) {
      setListError({ key: '*', message: err instanceof Error ? err.message : 'Não foi possível carregar as caixas.' });
      data = [];
    }
    setAccounts(data);
    // ?para=email abre o editor já com o destinatário (atalho de outras telas).
    const to = params.get('para');
    if (to && data.length && !openedFromLink.current) {
      openedFromLink.current = true;
      setDraft({ mode: 'new', accountId: data[0].id, to, cc: '', subject: params.get('assunto') || '', body: '' });
    }
  }, [params]);

  const loadTemplates = useCallback(async () => {
    const data = await api<Template[]>('/api/email/templates').catch(() => [] as Template[]);
    setTemplates(data);
  }, []);

  const loadList = useCallback(async (page = 0) => {
    const id = ++listRequest.current;
    const key = `${accountFilter}|${folder}|${query}`;
    try {
      const qs = new URLSearchParams({ account: accountFilter, folder, q: query, page: String(page) });
      const data = await api<Omit<ListState, 'key'> & { pageSize: number }>(`/api/email/messages?${qs}`);
      if (id !== listRequest.current) return;
      setListError(null);
      setList((current) => (page > 0 && current && current.key === key ? { ...data, key, items: [...current.items, ...data.items] } : { ...data, key }));
    } catch (err) {
      if (id === listRequest.current) setListError({ key, message: err instanceof Error ? err.message : 'Não foi possível carregar os e-mails.' });
    }
  }, [accountFilter, folder, query]);

  useEffect(() => {
    const first = setTimeout(() => { void loadAccounts(); void loadTemplates(); }, 0);
    return () => clearTimeout(first);
  }, [loadAccounts, loadTemplates]);

  const hasAccounts = Boolean(accounts?.length);
  useEffect(() => {
    if (!hasAccounts) return;
    const first = setTimeout(() => void loadList(0), 0);
    return () => clearTimeout(first);
  }, [hasAccounts, loadList]);

  // Busca com uma pausa enquanto digita.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Os e-mails novos chegam pela sincronização do servidor: confere a cada minuto.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadAccounts();
      void loadList(0);
    }, 60_000);
    return () => clearInterval(timer);
  }, [loadAccounts, loadList]);

  const openMessage = async (item: MessageItem) => {
    setSelectedId(item.id);
    setThreadLoading(true);
    setThreadError('');
    try {
      setThread(await api<Thread>(`/api/email/messages/${item.id}`));
      if (!item.isRead) {
        setList((current) => current && { ...current, items: current.items.map((m) => (m.id === item.id ? { ...m, isRead: true } : m)) });
        void loadAccounts();
      }
    } catch (err) {
      setThread(null);
      setThreadError(err instanceof Error ? err.message : 'Não foi possível abrir.');
    }
    setThreadLoading(false);
  };

  const closeReader = () => {
    setSelectedId(null);
    setThread(null);
    setThreadError('');
  };

  const patch = async (ids: string[], action: string) => api('/api/email/messages', jsonInit('PATCH', { ids, action }));

  const readerAction = async (action: 'star' | 'unstar' | 'unread' | 'trash' | 'restore' | 'delete') => {
    if (!thread) return;
    const ids = action === 'star' || action === 'unstar' || action === 'unread' ? [thread.openedId] : thread.messages.map((m) => m.id);
    if (action === 'delete' && !window.confirm('Excluir de vez? No sistema não dá para desfazer (no seu provedor de e-mail nada muda).')) return;
    try {
      await patch(ids, action);
      if (action === 'star' || action === 'unstar') {
        setThread({ ...thread, messages: thread.messages.map((m) => (m.id === thread.openedId ? { ...m, isStarred: action === 'star' } : m)) });
      } else {
        closeReader();
        setNotice(action === 'trash' ? 'Movido para a lixeira.' : action === 'restore' ? 'Restaurado.' : action === 'delete' ? 'Excluído.' : 'Marcado como não lido.');
      }
      void loadList(0);
      void loadAccounts();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Não foi possível.');
    }
  };

  const toggleStar = async (event: React.MouseEvent, item: MessageItem) => {
    event.stopPropagation();
    setList((current) => current && { ...current, items: current.items.map((m) => (m.id === item.id ? { ...m, isStarred: !item.isStarred } : m)) });
    await patch([item.id], item.isStarred ? 'unstar' : 'star').catch(() => void loadList(0));
  };

  const refresh = async () => {
    if (!accounts?.length) return;
    setRefreshing(true);
    setNotice('');
    const targets = accountFilter === 'all' ? accounts.filter((a) => a.status !== 'paused') : accounts.filter((a) => a.id === accountFilter);
    let saved = 0;
    const problems: string[] = [];
    for (const account of targets) {
      try {
        saved += (await api<{ saved: number }>(`/api/email/accounts/${account.id}/sync`, { method: 'POST' })).saved;
      } catch (err) {
        problems.push(`${account.name}: ${err instanceof Error ? err.message : 'falhou'}`);
      }
    }
    setNotice(problems.length ? problems.join(' · ') : saved ? `${saved} e-mail(s) novo(s).` : 'Nenhum e-mail novo.');
    await Promise.all([loadAccounts(), loadList(0)]);
    setRefreshing(false);
  };

  const defaultAccountId = () => {
    if (accountFilter !== 'all') return accountFilter;
    return (accounts || []).find((a) => a.kind === 'shared')?.id || accounts?.[0]?.id || '';
  };

  const startReply = (message: MessageFull, mode: 'reply' | 'replyAll' | 'forward') => {
    if (!thread) return;
    const own = thread.account.emailAddress;
    if (mode === 'forward') {
      setDraft({ mode, accountId: thread.account.id, to: '', cc: '', subject: forwardSubject(message.subject), body: '', parent: message });
      return;
    }
    const from = { name: message.fromName, address: message.fromAddress };
    let to: string;
    let cc = '';
    if (message.direction === 'out') {
      to = formatAddressList(message.to);
      if (mode === 'replyAll') cc = formatAddressList(message.cc);
    } else if (mode === 'replyAll') {
      const all = replyAllRecipients({ from, replyTo: message.replyTo, to: message.to, cc: message.cc, own });
      to = formatAddressList(all.to);
      cc = formatAddressList(all.cc);
    } else {
      to = message.replyTo || formatAddress(from);
    }
    setDraft({ mode, accountId: thread.account.id, to, cc, subject: replySubject(message.subject), body: '', parent: message });
  };

  const afterSent = async (accountId: string) => {
    setDraft(null);
    setNotice('E-mail enviado.');
    if (thread && thread.account.id === accountId) {
      setThread(await api<Thread>(`/api/email/messages/${thread.openedId}`).catch(() => thread));
    }
    void loadList(0);
  };

  const visibleList = list && list.key === listKey ? list : null;
  const visibleError = listError && (listError.key === listKey || listError.key === '*') ? listError.message : '';
  const accountName = useMemo(() => new Map((accounts || []).map((a) => [a.id, a.name])), [accounts]);
  const totalUnread = (accounts || []).reduce((sum, a) => sum + a.unread, 0);
  const brokenAccounts = (accounts || []).filter((a) => a.status === 'error' && (accountFilter === 'all' || a.id === accountFilter));
  const showAccountTag = accountFilter === 'all' && (accounts?.length || 0) > 1;

  if (accounts === null) {
    return <div className={styles.container}><p className={styles.empty}><Loader2 size={16} className={styles.spin} /> Carregando...</p></div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1>E-mail</h1>
          <p>{accounts.length ? `${totalUnread ? `${totalUnread} não lido(s) · ` : ''}${accounts.length} caixa(s) conectada(s)` : 'Receba, leia e responda os e-mails da empresa aqui dentro.'}</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => setShowTemplates(true)}><FileText size={16} /> Modelos</button>
          <button type="button" className={styles.secondaryBtn} onClick={() => setShowAccounts(true)}><Settings2 size={16} /> Caixas</button>
          {accounts.length > 0 && (
            <button type="button" className={styles.primaryBtn} onClick={() => setDraft({ mode: 'new', accountId: defaultAccountId(), to: '', cc: '', subject: '', body: '' })}>
              <PenSquare size={16} /> Escrever
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <button type="button" className={styles.iconBtn} onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={15} /></button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className={styles.readerPane}>
          <div className={styles.placeholder}>
            <Mail size={34} />
            <p><strong>Nenhuma caixa conectada.</strong></p>
            <p>{canShared ? 'Conecte o e-mail da empresa (ex.: contato@) ou o seu e-mail de trabalho.' : 'Conecte o seu e-mail de trabalho. A caixa da empresa é conectada por um administrador ou gerente.'}</p>
            <button type="button" className={styles.primaryBtn} onClick={() => setShowAccounts(true)}><Mail size={16} /> Conectar caixa</button>
          </div>
        </div>
      ) : (
        <div className={`${styles.layout} ${selectedId ? styles.hasReader : ''}`}>
          <nav className={styles.navPane} aria-label="Caixas e pastas">
            <p className={styles.navTitle}>Caixas</p>
            <button type="button" className={`${styles.navItem} ${accountFilter === 'all' ? styles.navOn : ''}`} onClick={() => { setAccountFilter('all'); closeReader(); }}>
              <Inbox size={16} /> <span>Todas</span>
              {totalUnread > 0 && <em className={styles.count}>{totalUnread}</em>}
            </button>
            {accounts.map((account) => (
              <button key={account.id} type="button" className={`${styles.navItem} ${accountFilter === account.id ? styles.navOn : ''}`} onClick={() => { setAccountFilter(account.id); closeReader(); }} title={account.emailAddress}>
                {account.kind === 'personal' ? <User size={16} /> : <Mail size={16} />}
                <span>{account.name}</span>
                {account.status !== 'active' ? <i className={`${styles.statusDot} ${styles[`dot_${account.status}`]}`} aria-label={account.status === 'error' ? 'com erro' : 'pausada'} /> : account.unread > 0 && <em className={styles.count}>{account.unread}</em>}
              </button>
            ))}
            <p className={styles.navTitle}>Pastas</p>
            {FOLDERS.map(({ key, icon: Icon }) => (
              <button key={key} type="button" className={`${styles.navItem} ${folder === key ? styles.navOn : ''}`} onClick={() => { setFolder(key); closeReader(); }}>
                <Icon size={16} /> <span>{FOLDER_LABEL[key]}</span>
              </button>
            ))}
          </nav>

          <section className={styles.listPane} aria-label="E-mails">
            <div className={styles.navSelects}>
              <select className={styles.input} value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); closeReader(); }} aria-label="Caixa">
                <option value="all">Todas as caixas{totalUnread ? ` (${totalUnread})` : ''}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.unread ? ` (${a.unread})` : ''}</option>)}
              </select>
              <select className={styles.input} value={folder} onChange={(e) => { setFolder(e.target.value as Folder); closeReader(); }} aria-label="Pasta">
                {FOLDERS.map(({ key }) => <option key={key} value={key}>{FOLDER_LABEL[key]}</option>)}
              </select>
            </div>
            <div className={styles.listTools}>
              <label className={styles.search}>
                <Search size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar em ${FOLDER_LABEL[folder]}`} aria-label="Buscar e-mails" />
              </label>
              <button type="button" className={styles.iconBtn} onClick={refresh} disabled={refreshing} aria-label="Buscar e-mails novos" title="Buscar e-mails novos">
                <RefreshCw size={17} className={refreshing ? styles.spin : ''} />
              </button>
            </div>
            {brokenAccounts.map((account) => (
              <div key={account.id} className={`${styles.errorBox} ${styles.accountAlert}`}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span><strong>{account.name}</strong> não está sincronizando: {account.lastError}{account.canManage && <> <button type="button" className={styles.linkBtn} onClick={() => setShowAccounts(true)}>Corrigir</button></>}</span>
              </div>
            ))}
            {visibleError && <div className={`${styles.errorBox} ${styles.accountAlert}`}>{visibleError}</div>}
            {!visibleList && !visibleError && <p className={styles.empty}><Loader2 size={15} className={styles.spin} /> Carregando...</p>}
            {visibleList && visibleList.items.length === 0 && (
              <p className={styles.empty}>{query ? 'Nada encontrado.' : folder === 'inbox' ? 'Nenhum e-mail na entrada. Os novos chegam sozinhos a cada 2 minutos.' : `Nada em ${FOLDER_LABEL[folder]}.`}</p>
            )}
            {visibleList && visibleList.items.length > 0 && (
              <ul className={styles.items}>
                {visibleList.items.map((item) => {
                  const who = item.direction === 'out' ? `Para: ${item.to.map((t) => t.name || t.address).join(', ') || '—'}` : item.fromName || item.fromAddress;
                  return (
                    <li key={item.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={`${styles.item} ${selectedId === item.id ? styles.itemOn : ''} ${!item.isRead ? styles.itemUnread : ''}`}
                        onClick={() => openMessage(item)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openMessage(item); } }}
                      >
                        <button type="button" className={`${styles.starBtn} ${item.isStarred ? styles.starOn : ''}`} onClick={(e) => toggleStar(e, item)} aria-label={item.isStarred ? 'Tirar dos favoritos' : 'Favoritar'}>
                          <Star size={15} fill={item.isStarred ? 'currentColor' : 'none'} />
                        </button>
                        <span className={styles.itemMain}>
                          <span className={styles.itemTop}>
                            {!item.isRead && <i className={styles.unreadDot} aria-label="Não lido" />}
                            <span className={styles.itemFrom}>{who}</span>
                            {showAccountTag && <span className={styles.accountTag}>{accountName.get(item.accountId)}</span>}
                            <span className={styles.itemTime}>{shortDate(item.sentAt)}</span>
                          </span>
                          <span className={styles.itemSubject}>{item.subject || '(sem assunto)'}</span>
                          <span className={styles.itemTop}>
                            <span className={styles.itemSnippet}>{item.snippet}</span>
                            {item.hasAttachments && <span className={styles.itemIcons}><Paperclip size={13} aria-label="Com anexo" /></span>}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
                {visibleList.items.length < visibleList.total && (
                  <button type="button" className={`${styles.secondaryBtn} ${styles.more}`} disabled={loadingMore} onClick={async () => { setLoadingMore(true); await loadList(visibleList.page + 1); setLoadingMore(false); }}>
                    {loadingMore && <Loader2 size={15} className={styles.spin} />} Carregar mais ({visibleList.total - visibleList.items.length})
                  </button>
                )}
              </ul>
            )}
          </section>

          <section className={styles.readerPane} aria-label="Leitura">
            <Reader thread={thread} loading={threadLoading} error={threadError} onBack={closeReader} onReply={startReply} onAction={readerAction} />
          </section>
        </div>
      )}

      {draft && accounts.length > 0 && <Composer draft={draft} accounts={accounts} templates={templates} onClose={() => setDraft(null)} onSent={afterSent} />}
      {showAccounts && <AccountsModal accounts={accounts} canShared={canShared} onClose={() => setShowAccounts(false)} onChanged={() => { void loadAccounts(); void loadList(0); }} />}
      {showTemplates && <TemplatesModal templates={templates} onClose={() => setShowTemplates(false)} onChanged={loadTemplates} />}
    </div>
  );
}

export default function EmailPageRoute() {
  return (
    <Suspense fallback={null}>
      <EmailPage />
    </Suspense>
  );
}
