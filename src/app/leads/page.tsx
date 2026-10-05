"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Ban, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, MessageSquare, Plus, Search, Tag as TagIcon, Trash2, UserX, Users, X } from 'lucide-react';

import styles from './leads.module.css';
import { useLeads, type BulkAction } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import type { Lead } from '@/types';
import { TagBadge } from '@/components/leads/TagPicker';
import { useTeam } from '@/components/leads/useTeam';
import LeadPanel from './components/LeadPanel';
import TagsManager from './components/TagsManager';
import { digits, exportCsv, initials } from './format';

const PAGE_SIZE = 50;
type Quick = 'all' | 'new' | 'unassigned' | 'blocked';
type Sort = 'recent' | 'oldest' | 'name' | 'value';

function LeadsContent() {
  const { leads, pipelineStages, loaded, openModal, tags, refreshTags, updateLead, deleteLead, bulkUpdate } = useLeads();
  const { user } = useAuth();
  const canAssign = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const team = useTeam(Boolean(user));
  const router = useRouter();
  const pathname = usePathname();
  const openId = useSearchParams().get('lead');

  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<Quick>('all');
  const [stage, setStage] = useState('');
  const [owner, setOwner] = useState('');
  const [tag, setTag] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showTags, setShowTags] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const stageName = (id: string) => pipelineStages.find((item) => item.id === id)?.name || 'Sem etapa';
  const stageColor = (id: string) => pipelineStages.find((item) => item.id === id)?.color || '#64748b';
  const ownerName = (id?: string | null) => (id ? team.find((member) => member.id === id)?.name || '—' : 'Sem responsável');
  const tagColor = (name: string) => tags.find((item) => item.name.toLowerCase() === name.toLowerCase())?.color;
  const [weekAgo] = useState(() => Date.now() - 7 * 86400_000);

  const sources = useMemo(() => Array.from(new Set(leads.map((lead) => lead.source || '').filter(Boolean))).sort(), [leads]);

  const counts = useMemo(() => ({
    all: leads.length,
    new: leads.filter((lead) => lead.createdAt && new Date(lead.createdAt).getTime() >= weekAgo).length,
    unassigned: leads.filter((lead) => !lead.assignedTo).length,
    blocked: leads.filter((lead) => lead.status === 'Bloqueado').length,
  }), [leads, weekAgo]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const phoneText = digits(query);
    const list = leads.filter((lead) => {
      if (quick === 'new' && !(lead.createdAt && new Date(lead.createdAt).getTime() >= weekAgo)) return false;
      if (quick === 'unassigned' && lead.assignedTo) return false;
      if (quick === 'blocked' ? lead.status !== 'Bloqueado' : false) return false;
      if (stage && lead.pipelineStage !== stage) return false;
      if (owner && (owner === 'none' ? lead.assignedTo : lead.assignedTo !== owner)) return false;
      if (tag && !lead.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return false;
      if (source && lead.source !== source) return false;
      if (!text) return true;
      return lead.name.toLowerCase().includes(text)
        || lead.email.toLowerCase().includes(text)
        || (phoneText.length >= 3 && digits(lead.phone).includes(phoneText))
        || lead.tags.some((item) => item.toLowerCase().includes(text));
    });
    const time = (lead: Lead) => (lead.createdAt ? new Date(lead.createdAt).getTime() : 0);
    return list.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR')
        : sort === 'value' ? (b.valueNumber ?? 0) - (a.valueNumber ?? 0)
          : sort === 'oldest' ? time(a) - time(b)
            : time(b) - time(a));
  }, [leads, query, quick, stage, owner, tag, source, sort, weekAgo]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const hasFilters = Boolean(query || quick !== 'all' || stage || owner || tag || source);
  const allVisibleSelected = visible.length > 0 && visible.every((lead) => selected.has(lead.id));
  const openLead = leads.find((lead) => lead.id === openId) || null;

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  const clearFilters = () => {
    setQuery('');
    setQuick('all');
    setStage('');
    setOwner('');
    setTag('');
    setSource('');
    setPage(0);
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    visible.forEach((lead) => (allVisibleSelected ? next.delete(lead.id) : next.add(lead.id)));
    return next;
  });

  const runBulk = async (action: BulkAction, value: string | null = null) => {
    const ids = Array.from(selected);
    if (action === 'delete' && !confirm(`Excluir ${ids.length} lead(s)? Não dá para desfazer.`)) return;
    setBusy(true);
    const result = await bulkUpdate(ids, action, value);
    setBusy(false);
    if (!result.ok) {
      setNotice({ type: 'error', text: result.error });
      return;
    }
    setNotice({ type: 'ok', text: `${result.count ?? 0} lead(s) atualizado(s).` });
    if (action === 'delete') setSelected(new Set());
  };

  const openPanel = (id: string | null) => router.replace(id ? `${pathname}?lead=${id}` : pathname, { scroll: false });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>{canAssign ? 'Leads' : 'Meus leads'}</h1>
          <p>{canAssign ? 'Todos os contatos da empresa. Clique em um lead para ver e editar.' : 'Os contatos que estão com você. Clique em um lead para ver e editar.'}</p>
        </div>
        <div className={styles.headerActions}>
          {canAssign && (
            <button type="button" className={styles.secondaryBtn} onClick={() => setShowTags(true)}>
              <TagIcon size={16} /> Etiquetas
            </button>
          )}
          <button type="button" className={styles.secondaryBtn} onClick={() => exportCsv(filtered, stageName, ownerName)} disabled={filtered.length === 0}>
            <Download size={16} /> Exportar {hasFilters ? 'filtrados' : ''}
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => openModal()}>
            <Plus size={16} /> Novo lead
          </button>
        </div>
      </header>

      <div className={styles.quick} role="tablist" aria-label="Atalhos">
        {([
          ['all', 'Todos', Users],
          ['new', 'Novos em 7 dias', Plus],
          ...(canAssign ? [['unassigned', 'Sem responsável', UserX]] : []),
          ['blocked', 'Bloqueados', Ban],
        ] as [Quick, string, typeof Users][]).map(([value, label, Icon]) => (
          <button key={value} type="button" role="tab" aria-selected={quick === value} className={`${styles.quickCard} ${quick === value ? styles.quickOn : ''}`} onClick={() => resetPage(setQuick)(quick === value && value !== 'all' ? 'all' : value)}>
            <Icon size={18} />
            <span>{label}</span>
            <strong>{counts[value]}</strong>
          </button>
        ))}
      </div>

      <section className={styles.listCard}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={16} />
            <input type="search" placeholder="Buscar por nome, telefone, e-mail ou etiqueta" value={query} onChange={(e) => resetPage(setQuery)(e.target.value)} />
          </label>
          <select className={styles.select} value={stage} onChange={(e) => resetPage(setStage)(e.target.value)} aria-label="Etapa">
            <option value="">Todas as etapas</option>
            {pipelineStages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {canAssign && (
            <select className={styles.select} value={owner} onChange={(e) => resetPage(setOwner)(e.target.value)} aria-label="Responsável">
              <option value="">Todos os responsáveis</option>
              <option value="none">Sem responsável</option>
              {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          )}
          <select className={styles.select} value={tag} onChange={(e) => resetPage(setTag)(e.target.value)} aria-label="Etiqueta">
            <option value="">Todas as etiquetas</option>
            {tags.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
          {sources.length > 1 && (
            <select className={styles.select} value={source} onChange={(e) => resetPage(setSource)(e.target.value)} aria-label="Origem">
              <option value="">Todas as origens</option>
              {sources.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          )}
          <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
            <option value="name">Nome (A–Z)</option>
            <option value="value">Maior valor</option>
          </select>
          {hasFilters && <button type="button" className={styles.linkBtn} onClick={clearFilters}><X size={14} /> Limpar filtros</button>}
        </div>

        {selected.size > 0 && (
          <div className={styles.bulkBar} role="toolbar" aria-label="Ações nos selecionados">
            <strong>{selected.size} selecionado(s)</strong>
            <select className={styles.select} value="" onChange={(e) => e.target.value && runBulk('stage', e.target.value)} disabled={busy} aria-label="Mudar etapa">
              <option value="">Mudar etapa…</option>
              {pipelineStages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {canAssign && (
              <select className={styles.select} value="" onChange={(e) => e.target.value && runBulk('assign', e.target.value === 'none' ? null : e.target.value)} disabled={busy} aria-label="Trocar responsável">
                <option value="">Responsável…</option>
                <option value="none">Sem responsável</option>
                {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            )}
            <select className={styles.select} value="" onChange={(e) => e.target.value && runBulk('addTag', e.target.value)} disabled={busy || tags.length === 0} aria-label="Adicionar etiqueta">
              <option value="">+ Etiqueta…</option>
              {tags.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
            <select className={styles.select} value="" onChange={(e) => e.target.value && runBulk('removeTag', e.target.value)} disabled={busy || tags.length === 0} aria-label="Tirar etiqueta">
              <option value="">− Etiqueta…</option>
              {tags.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
            <button type="button" className={styles.secondaryBtn} onClick={() => runBulk('block')} disabled={busy}><Ban size={14} /> Bloquear</button>
            <button type="button" className={styles.secondaryBtn} onClick={() => runBulk('unblock')} disabled={busy}>Desbloquear</button>
            <button type="button" className={styles.dangerBtn} onClick={() => runBulk('delete')} disabled={busy}><Trash2 size={14} /> Excluir</button>
            <button type="button" className={styles.linkBtn} onClick={() => setSelected(new Set())}>Limpar seleção</button>
            {busy && <Loader2 size={16} className={styles.spin} />}
          </div>
        )}

        <div className={styles.table} role="table" aria-label="Leads">
          <div className={`${styles.row} ${styles.headRow}`} role="row">
            <span role="columnheader"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Selecionar todos desta página" /></span>
            <span role="columnheader">Lead</span>
            <span role="columnheader">Telefone</span>
            <span role="columnheader">Etapa</span>
            {canAssign && <span role="columnheader">Responsável</span>}
            <span role="columnheader">Etiquetas</span>
            <span role="columnheader">Entrada</span>
            <span role="columnheader" aria-label="Ações" />
          </div>

          {!loaded && <p className={styles.empty}><Loader2 size={16} className={styles.spin} /> Carregando leads...</p>}
          {loaded && leads.length === 0 && (
            <div className={styles.empty}>
              <Users size={30} />
              <strong>Nenhum lead ainda</strong>
              <span>Leads chegam pelo WhatsApp, pelo formulário do site, pelo totem ou pelo botão Novo lead.</span>
            </div>
          )}
          {loaded && leads.length > 0 && filtered.length === 0 && <p className={styles.empty}>Nenhum lead com esses filtros.</p>}

          {visible.map((lead) => (
            <div key={lead.id} role="row" className={`${styles.row} ${selected.has(lead.id) ? styles.rowSelected : ''} ${lead.status === 'Bloqueado' ? styles.rowBlocked : ''}`} onClick={() => openPanel(lead.id)}>
              <span role="cell" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} aria-label={`Selecionar ${lead.name}`} />
              </span>
              <span role="cell" className={styles.leadCell}>
                <span className={styles.avatar}>{initials(lead.name)}</span>
                <span className={styles.leadText}>
                  <strong>{lead.name}{lead.status === 'Bloqueado' && <Ban size={12} className={styles.blockedIcon} aria-label="Bloqueado" />}</strong>
                  <small>{lead.email || lead.source || ' '}</small>
                </span>
              </span>
              <span role="cell" className={styles.phone}>{lead.phone || '—'}</span>
              <span role="cell"><span className={styles.stage} style={{ ['--stage' as string]: stageColor(lead.pipelineStage) }}>{stageName(lead.pipelineStage)}</span></span>
              {canAssign && <span role="cell" className={lead.assignedTo ? '' : styles.mutedCell}>{ownerName(lead.assignedTo)}</span>}
              <span role="cell" className={styles.tagsCell}>
                {lead.tags.slice(0, 3).map((item) => <TagBadge key={item} name={item} color={tagColor(item)} />)}
                {lead.tags.length > 3 && <span className={styles.more}>+{lead.tags.length - 3}</span>}
              </span>
              <span role="cell" className={styles.dateCell}>{lead.entryDate}</span>
              <span role="cell" className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                <Link href={`/messages?chatId=${lead.id}`} className={styles.iconBtn} aria-label={`Conversa com ${lead.name}`} title="Abrir conversa"><MessageSquare size={16} /></Link>
              </span>
            </div>
          ))}
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className={styles.pager}>
            <span>{current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} de {filtered.length}</span>
            <button type="button" className={styles.iconBtn} onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Página anterior"><ChevronLeft size={16} /></button>
            <button type="button" className={styles.iconBtn} onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Próxima página"><ChevronRight size={16} /></button>
          </div>
        )}
        {filtered.length > 0 && filtered.length <= PAGE_SIZE && <p className={styles.countLine}>{filtered.length} lead(s)</p>}
      </section>

      {openLead && (
        <LeadPanel
          key={openLead.id}
          lead={openLead}
          stages={pipelineStages}
          team={team}
          tagOptions={tags}
          canAssign={canAssign}
          onSave={async (changes) => {
            const result = await updateLead(openLead.id, changes);
            if (!result.ok) return result.error;
            setNotice({ type: 'ok', text: 'Lead salvo.' });
            return null;
          }}
          onDelete={async () => {
            const result = await deleteLead(openLead.id);
            if (!result.ok) return result.error;
            openPanel(null);
            setNotice({ type: 'ok', text: 'Lead excluído.' });
            return null;
          }}
          onClose={() => openPanel(null)}
        />
      )}
      {openId && loaded && !openLead && (
        <div className={styles.toast} role="status"><AlertTriangle size={16} /> Esse lead não existe mais ou não está com você. <button type="button" className={styles.linkBtn} onClick={() => openPanel(null)}>Fechar</button></div>
      )}

      {showTags && <TagsManager tags={tags} onChanged={refreshTags} onClose={() => setShowTags(false)} />}

      {notice && (
        <div className={`${styles.toast} ${notice.type === 'error' ? styles.toastError : ''}`} role="status">
          {notice.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {notice.text}
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsContent />
    </Suspense>
  );
}
