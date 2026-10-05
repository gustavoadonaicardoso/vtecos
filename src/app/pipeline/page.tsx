"use client";

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { AlertTriangle, BarChart2, CheckCircle2, Kanban, Loader2, Plus, Search, X } from 'lucide-react';
import styles from './pipeline.module.css';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import type { Lead, PipelineStage } from '@/types';
import { useTeam } from '@/components/leads/useTeam';
import LeadPanel from '@/app/leads/components/LeadPanel';
import LeadCard from './components/LeadCard';
import StageHeader from './components/StageHeader';
import FunnelView from './components/FunnelView';

/** Etapa de ganhos: metas, relatórios e o Início dependem dela. */
const WON_STAGE = 'ganho';
const DAY = 86400_000;
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function PipelineContent() {
  const { pipelineStages, leads, loaded, moveLead, savePipelineStructure, structureError, clearStructureError, openModal, tags, updateLead, deleteLead } = useLeads();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const team = useTeam(Boolean(user));
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get('lead');
  const view = params.get('view') === 'funil' ? 'funnel' : 'board';

  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('');
  const [tag, setTag] = useState('');
  const [now] = useState(() => Date.now());
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };

  const daysIn = (lead: Lead) => {
    const since = lead.stageChangedAt || lead.createdAt;
    return since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / DAY)) : 0;
  };
  const ownerName = (id?: string | null) => (id ? team.find((member) => member.id === id)?.name || 'Membro inativo' : null);
  const tagColor = (name: string) => tags.find((item) => item.name.toLowerCase() === name.toLowerCase())?.color;

  // Leads visíveis por etapa (filtros aplicados), mais recentes na etapa primeiro.
  const leadsByStage = useMemo(() => {
    const text = query.trim().toLowerCase();
    const phone = query.replace(/\D/g, '');
    const map = new Map<string, Lead[]>(pipelineStages.map((stage) => [stage.id, []]));
    for (const lead of leads) {
      if (owner === 'mine' && lead.assignedTo !== user?.id) continue;
      if (owner === 'none' && lead.assignedTo) continue;
      if (owner && !['mine', 'none'].includes(owner) && lead.assignedTo !== owner) continue;
      if (tag && !lead.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) continue;
      if (text && !(lead.name.toLowerCase().includes(text) || lead.email.toLowerCase().includes(text) || (phone.length >= 3 && lead.phone.replace(/\D/g, '').includes(phone)) || lead.tags.some((item) => item.toLowerCase().includes(text)))) continue;
      map.get(lead.pipelineStage)?.push(lead);
    }
    const time = (lead: Lead) => new Date(lead.stageChangedAt || lead.createdAt || 0).getTime();
    map.forEach((list) => list.sort((a, b) => time(b) - time(a)));
    return map;
  }, [leads, pipelineStages, query, owner, tag, user?.id]);

  const hasFilters = Boolean(query || owner || tag);
  const orphans = leads.filter((lead) => !pipelineStages.some((stage) => stage.id === lead.pipelineStage)).length;
  const openLead = leads.find((lead) => lead.id === openId) || null;

  // ── Etapas ──
  const saveStages = (next: PipelineStage[], debounce = false) => {
    clearStructureError();
    savePipelineStructure(next, { debounce });
  };
  const renameStage = (id: string, name: string) => saveStages(pipelineStages.map((stage) => (stage.id === id ? { ...stage, name } : stage)));
  const colorStage = (id: string, color: string) => saveStages(pipelineStages.map((stage) => (stage.id === id ? { ...stage, color } : stage)));
  const moveStage = (id: string, direction: -1 | 1) => {
    const index = pipelineStages.findIndex((stage) => stage.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= pipelineStages.length) return;
    const next = [...pipelineStages];
    [next[index], next[target]] = [next[target], next[index]];
    saveStages(next);
  };
  const deleteStage = (id: string) => {
    if (id === WON_STAGE || pipelineStages.length <= 1) return;
    const stage = pipelineStages.find((item) => item.id === id);
    const remaining = pipelineStages.filter((item) => item.id !== id);
    const count = stage?.leads.length ?? 0;
    const message = count > 0 ? `Excluir a etapa "${stage?.name}"? Os ${count} lead(s) dela vão para "${remaining[0].name}".` : `Excluir a etapa "${stage?.name}"?`;
    if (confirm(message)) saveStages(remaining);
  };
  const addStage = () => {
    const stage: PipelineStage = { id: `etapa-${Date.now()}`, name: 'Nova etapa', color: '#06b6d4', leads: [] };
    // Entra antes de "Ganhos", que costuma ser a última etapa.
    const wonIndex = pipelineStages.findIndex((item) => item.id === WON_STAGE);
    const next = [...pipelineStages];
    next.splice(wonIndex >= 0 ? wonIndex : next.length, 0, stage);
    saveStages(next);
    setNotice({ type: 'ok', text: 'Etapa criada. Use o menu ⋮ da coluna para renomear.' });
  };

  // ── Arrastar ──
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId, type } = result;
    if (!destination) return;
    if (type === 'COLUMN') {
      if (source.index === destination.index) return;
      const next = [...pipelineStages];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      saveStages(next);
      return;
    }
    // Dentro da mesma coluna a ordem é sempre "mais recente na etapa primeiro".
    if (source.droppableId === destination.droppableId) return;
    const target = pipelineStages.find((stage) => stage.id === destination.droppableId);
    const moved = await moveLead(draggableId, destination.droppableId);
    if (!moved.ok) setNotice({ type: 'error', text: moved.error });
    else if (destination.droppableId === WON_STAGE) setNotice({ type: 'ok', text: `Venda ganha! O lead foi para "${target?.name}".` });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>{canManage ? 'Funil de vendas' : 'Meu funil'}</h1>
          <p>{view === 'board' ? 'Arraste os cartões entre as etapas. Clique em um cartão para ver e editar o lead.' : 'Quantos leads e quanto valor há em cada etapa.'}</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.segmented} role="tablist" aria-label="Visualização">
            <button type="button" role="tab" aria-selected={view === 'board'} className={view === 'board' ? styles.segmentOn : ''} onClick={() => setParam('view', null)}><Kanban size={15} /> Quadro</button>
            <button type="button" role="tab" aria-selected={view === 'funnel'} className={view === 'funnel' ? styles.segmentOn : ''} onClick={() => setParam('view', 'funil')}><BarChart2 size={15} /> Funil</button>
          </div>
          {canManage && view === 'board' && <button type="button" className={styles.secondaryBtn} onClick={addStage}><Plus size={15} /> Etapa</button>}
          <button type="button" className={styles.primaryBtn} onClick={() => openModal()}><Plus size={15} /> Novo lead</button>
        </div>
      </header>

      <div className={styles.filters}>
        <label className={styles.search}>
          <Search size={15} />
          <input type="search" placeholder="Buscar no funil" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {canManage && (
          <select className={styles.select} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável">
            <option value="">Todos os responsáveis</option>
            <option value="mine">Só os meus</option>
            <option value="none">Sem responsável</option>
            {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        )}
        {tags.length > 0 && (
          <select className={styles.select} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Etiqueta">
            <option value="">Todas as etiquetas</option>
            {tags.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        )}
        {hasFilters && <button type="button" className={styles.linkBtn} onClick={() => { setQuery(''); setOwner(''); setTag(''); }}><X size={14} /> Limpar</button>}
      </div>

      {structureError && (
        <div className={styles.errorBox}><AlertTriangle size={16} /> {structureError} <button type="button" className={styles.linkBtn} onClick={clearStructureError}>Fechar</button></div>
      )}
      {orphans > 0 && (
        <div className={styles.warnBox}><AlertTriangle size={16} /> {orphans} lead(s) estão numa etapa que não existe mais e não aparecem no quadro. Mova-os pela tela de Leads.</div>
      )}

      {!loaded ? (
        <p className={styles.loading}><Loader2 size={16} className={styles.spin} /> Carregando funil...</p>
      ) : view === 'funnel' ? (
        <FunnelView
          stages={pipelineStages}
          leadsByStage={leadsByStage}
          daysIn={daysIn}
          wonId={WON_STAGE}
          canEdit={canManage}
          onRename={renameStage}
          onColor={colorStage}
          onMove={moveStage}
          onDelete={deleteStage}
          onAdd={addStage}
        />
      ) : (
        <div className={styles.boardScroll}>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="pipeline-board" type="COLUMN" direction="horizontal">
              {(board) => (
                <div className={styles.board} ref={board.innerRef} {...board.droppableProps}>
                  {pipelineStages.map((stage, stageIndex) => {
                    const list = leadsByStage.get(stage.id) || [];
                    const total = list.reduce((sum, lead) => sum + (lead.valueNumber ?? 0), 0);
                    return (
                      <Draggable key={stage.id} draggableId={`column-${stage.id}`} index={stageIndex} isDragDisabled={!canManage}>
                        {(column, columnState) => (
                          <section ref={column.innerRef} {...column.draggableProps} className={`${styles.column} ${columnState.isDragging ? styles.columnDragging : ''} ${stage.id === WON_STAGE ? styles.columnWon : ''}`} aria-label={`Etapa ${stage.name}`}>
                            <StageHeader
                              name={stage.name}
                              color={stage.color}
                              count={list.length}
                              total={total > 0 ? brl(total) : ''}
                              canEdit={canManage}
                              isWon={stage.id === WON_STAGE}
                              isFirst={stageIndex === 0}
                              isLast={stageIndex === pipelineStages.length - 1}
                              dragHandle={column.dragHandleProps as Record<string, unknown> | null}
                              onRename={(name) => renameStage(stage.id, name)}
                              onColor={(color) => colorStage(stage.id, color)}
                              onMove={(direction) => moveStage(stage.id, direction)}
                              onDelete={() => deleteStage(stage.id)}
                            />
                            <Droppable droppableId={stage.id} type="LEAD">
                              {(drop, dropState) => (
                                <div ref={drop.innerRef} {...drop.droppableProps} className={`${styles.cards} ${dropState.isDraggingOver ? styles.cardsOver : ''}`}>
                                  {list.map((lead, index) => (
                                    <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                      {(drag, dragState) => (
                                        <div
                                          ref={drag.innerRef}
                                          {...drag.draggableProps}
                                          {...drag.dragHandleProps}
                                          role="button"
                                          tabIndex={0}
                                          aria-label={`Abrir ${lead.name}`}
                                          onClick={() => setParam('lead', lead.id)}
                                          onKeyDown={(e) => e.key === 'Enter' && setParam('lead', lead.id)}
                                        >
                                          <LeadCard
                                            lead={lead}
                                            ownerName={ownerName(lead.assignedTo)}
                                            days={daysIn(lead)}
                                            tagColor={tagColor}
                                            showOwner={canManage}
                                            dragging={dragState.isDragging}
                                          />
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {drop.placeholder}
                                  {list.length === 0 && !dropState.isDraggingOver && <p className={styles.emptyColumn}>{hasFilters ? 'Nada com esses filtros' : 'Arraste leads para cá'}</p>}
                                  <button type="button" className={styles.addLead} onClick={() => openModal({ pipelineStage: stage.id })}>
                                    <Plus size={14} /> Lead nesta etapa
                                  </button>
                                </div>
                              )}
                            </Droppable>
                          </section>
                        )}
                      </Draggable>
                    );
                  })}
                  {board.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      {openLead && (
        <LeadPanel
          key={openLead.id}
          lead={openLead}
          stages={pipelineStages}
          team={team}
          tagOptions={tags}
          canAssign={canManage}
          onSave={async (changes) => {
            const result = await updateLead(openLead.id, changes);
            if (!result.ok) return result.error;
            setNotice({ type: 'ok', text: 'Lead salvo.' });
            return null;
          }}
          onDelete={async () => {
            const result = await deleteLead(openLead.id);
            if (!result.ok) return result.error;
            setParam('lead', null);
            setNotice({ type: 'ok', text: 'Lead excluído.' });
            return null;
          }}
          onClose={() => setParam('lead', null)}
        />
      )}

      {notice && (
        <div className={`${styles.toast} ${notice.type === 'error' ? styles.toastError : ''}`} role="status">
          {notice.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {notice.text}
        </div>
      )}
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelineContent />
    </Suspense>
  );
}
