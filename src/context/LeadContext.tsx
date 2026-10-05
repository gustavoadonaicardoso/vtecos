"use client";

/**
 * ============================================================
 * VÓRTICE CRM — LeadContext
 * ============================================================
 * Estado global de Leads e Pipeline. Toda gravação passa pelas rotas
 * /api/leads (sessão + empresa verificadas no servidor); aqui fica só
 * o estado da tela. Sem dados de exemplo: se o servidor recusar, a
 * tela volta ao que está salvo e mostra o erro.
 * ============================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

import type { Lead, LeadTag, PipelineStage } from '@/types';

export type { Lead, LeadTag, PipelineStage };

/** Campos que a tela pode alterar (o resto é calculado pelo servidor). */
const EDITABLE: (keyof Lead)[] = ['name', 'email', 'phone', 'cpfCnpj', 'value', 'pipelineStage', 'assignedTo', 'tags', 'notes', 'status'];

export type LeadInput = Partial<Pick<Lead, 'name' | 'email' | 'phone' | 'cpfCnpj' | 'pipelineStage' | 'assignedTo' | 'tags' | 'notes' | 'status'>> & { value?: string | number };

export type AddLeadResult =
  | { ok: true; lead: Lead }
  | { ok: false; error: string; duplicate?: { id: string | null; name: string | null } };

export type BulkAction = 'assign' | 'stage' | 'addTag' | 'removeTag' | 'block' | 'unblock' | 'delete';

type Result = { ok: true } | { ok: false; error: string };

type LeadContextType = {
  leads: Lead[];
  pipelineStages: PipelineStage[];
  /** Já carregou do servidor ao menos uma vez. */
  loaded: boolean;
  isModalOpen: boolean;
  /** Abre o "Novo lead"; `defaults.pipelineStage` já escolhe a etapa (botão da coluna do funil). */
  openModal: (defaults?: { pipelineStage?: string }) => void;
  modalDefaults: { pipelineStage?: string };
  /** Último lead cadastrado pelo "Novo lead" (Mensagens abre a conversa dele). */
  lastCreatedLeadId: string | null;
  closeModal: () => void;
  addLead: (input: LeadInput, options?: { force?: boolean }) => Promise<AddLeadResult>;
  updateLead: (leadId: string, updates: Partial<Lead> | LeadInput) => Promise<Result>;
  deleteLead: (leadId: string) => Promise<Result>;
  bulkUpdate: (ids: string[], action: BulkAction, value?: string | null) => Promise<Result & { count?: number }>;
  /** Etiquetas cadastradas pela empresa. */
  tags: LeadTag[];
  refreshTags: () => Promise<void>;
  /** Move um lead de etapa (arrastar no funil). Volta atrás se o servidor recusar. */
  moveLead: (leadId: string, stageId: string) => Promise<Result>;
  /** Erro ao salvar as etapas do funil (a tela mostra e limpa). */
  structureError: string;
  clearStructureError: () => void;
  /** Salva a estrutura do funil (criar, renomear, cor, excluir, reordenar etapas). */
  savePipelineStructure: (newStages: PipelineStage[], options?: { debounce?: boolean }) => void;
  dbStatus: boolean;
  refreshDatabase: () => Promise<void>;
};

const LeadContext = createContext<LeadContextType | undefined>(undefined);

export const useLeads = () => {
  const context = useContext(LeadContext);
  if (!context) throw new Error('useLeads must be used within a LeadProvider');
  return context;
};

async function send(url: string, method: string, body?: unknown) {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, json };
  } catch {
    return { ok: false, status: 0, json: { error: 'Falha de conexão. Confira a internet e tente de novo.' } };
  }
}

// ─── Provider ─────────────────────────────────────────────────

export const LeadProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [tags, setTags] = useState<LeadTag[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDefaults, setModalDefaults] = useState<{ pipelineStage?: string }>({});
  const [structureError, setStructureError] = useState('');
  const [lastCreatedLeadId, setLastCreatedLeadId] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const leadsRef = useRef<Lead[]>([]);
  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  const fetchDatabase = useCallback(async () => {
    const { ok, json } = await send('/api/leads', 'GET');
    if (ok && json.data) {
      setDbStatus(true);
      setLeads(json.data.leads);
      setPipelineStages(json.data.stages);
    }
    setLoaded(true);
  }, []);

  const refreshTags = useCallback(async () => {
    const { ok, json } = await send('/api/leads/tags', 'GET');
    if (ok && Array.isArray(json.data)) setTags(json.data);
  }, []);

  // Empresa sem o módulo de CRM no plano: nada de leads/pipeline.
  const hasCrm = !user?.workspace || user.workspace.modules.includes('crm');

  useEffect(() => {
    if (!user || !hasCrm) return;
    // Primeira carga logo depois de montar (fora do corpo do efeito).
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      fetchDatabase();
      refreshTags();
    }, 0);
    if (!supabase) return () => { if (timer) clearTimeout(timer); };

    // Realtime: mudanças em leads ou etapas refazem a busca (agrupadas).
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fetchDatabase, 400);
    };
    const channel = supabase
      .channel('leads_realtime_changes')
      .on('postgres_changes', { event: '*', table: 'leads', schema: 'public' }, schedule)
      .on('postgres_changes', { event: '*', table: 'pipeline_stages', schema: 'public' }, schedule)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase?.removeChannel(channel);
    };
  }, [fetchDatabase, refreshTags, hasCrm, user]);

  const openModal = (defaults?: { pipelineStage?: string }) => {
    // Também é usado direto como onClick (recebe o evento): só aceita o objeto de opções.
    setModalDefaults(defaults && typeof defaults === 'object' && 'pipelineStage' in defaults ? { pipelineStage: defaults.pipelineStage } : {});
    setIsModalOpen(true);
  };
  const closeModal = () => setIsModalOpen(false);

  // ─── addLead ────────────────────────────────────────────────
  const addLead = async (input: LeadInput, options: { force?: boolean } = {}): Promise<AddLeadResult> => {
    const { ok, json } = await send('/api/leads', 'POST', { ...input, force: options.force });
    if (!ok || !json.data) return { ok: false, error: json.error || 'Não foi possível cadastrar o lead.', duplicate: json.duplicate };
    const lead = json.data as Lead;
    setLeads((prev) => [lead, ...prev.filter((item) => item.id !== lead.id)]);
    setLastCreatedLeadId(lead.id);
    setPipelineStages((prev) => prev.map((s) => (s.id === lead.pipelineStage ? { ...s, leads: [lead.id, ...s.leads] } : s)));
    if (input.tags?.length) refreshTags();
    return { ok: true, lead };
  };

  // ─── updateLead ─────────────────────────────────────────────
  // Manda só o que mudou: telas que passam o lead inteiro (Pipeline)
  // não regravam campos antigos sem querer.
  const updateLead = async (leadId: string, updates: Partial<Lead> | LeadInput): Promise<Result> => {
    const current = leadsRef.current.find((lead) => lead.id === leadId);
    const changed: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (!(key in updates)) continue;
      const next = (updates as Record<string, unknown>)[key];
      const before = current ? (current as Record<string, unknown>)[key] : undefined;
      if (JSON.stringify(next ?? null) !== JSON.stringify(before ?? null)) changed[key] = next;
    }
    if (Object.keys(changed).length === 0) return { ok: true };

    const previous = leadsRef.current;
    setLeads((prev) => prev.map((lead) => (lead.id === leadId ? { ...lead, ...(changed as Partial<Lead>) } : lead)));
    const { ok, json } = await send(`/api/leads/${leadId}`, 'PATCH', changed);
    if (!ok) {
      setLeads(previous);
      return { ok: false, error: json.error || 'Não foi possível salvar o lead.' };
    }
    if (json.data) setLeads((prev) => prev.map((lead) => (lead.id === leadId ? (json.data as Lead) : lead)));
    if ('pipelineStage' in changed) {
      setPipelineStages((prev) => prev.map((s) => ({
        ...s,
        leads: s.id === changed.pipelineStage ? [leadId, ...s.leads.filter((id) => id !== leadId)] : s.leads.filter((id) => id !== leadId),
      })));
    }
    if ('tags' in changed) refreshTags();
    return { ok: true };
  };

  // ─── deleteLead ─────────────────────────────────────────────
  const deleteLead = async (leadId: string): Promise<Result> => {
    const { ok, json } = await send(`/api/leads/${leadId}`, 'DELETE');
    if (!ok) return { ok: false, error: json.error || 'Não foi possível excluir o lead.' };
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setPipelineStages((prev) => prev.map((s) => ({ ...s, leads: s.leads.filter((id) => id !== leadId) })));
    return { ok: true };
  };

  // ─── Ações em massa ─────────────────────────────────────────
  const bulkUpdate = async (ids: string[], action: BulkAction, value: string | null = null) => {
    const { ok, json } = await send('/api/leads/bulk', 'POST', { ids, action, value });
    await fetchDatabase();
    if (action === 'addTag' || action === 'removeTag') refreshTags();
    return ok ? { ok: true as const, count: json.data?.count as number } : { ok: false as const, error: json.error || 'Não foi possível aplicar.' };
  };

  // ─── moveLead (arrastar no funil) ───────────────────────────
  const moveLead = async (leadId: string, stageId: string): Promise<Result> => {
    const lead = leadsRef.current.find((item) => item.id === leadId);
    if (!lead || lead.pipelineStage === stageId) return { ok: true };
    const previousLeads = leadsRef.current;
    const placed = (stages: PipelineStage[]) => stages.map((s) => ({
      ...s,
      leads: s.id === stageId ? [leadId, ...s.leads.filter((id) => id !== leadId)] : s.leads.filter((id) => id !== leadId),
    }));
    setLeads((prev) => prev.map((item) => (item.id === leadId ? { ...item, pipelineStage: stageId, stageChangedAt: new Date().toISOString() } : item)));
    setPipelineStages(placed);
    const { ok, json } = await send(`/api/leads/${leadId}`, 'PATCH', { action: 'move_stage', stageId });
    if (!ok) {
      setLeads(previousLeads);
      setPipelineStages((stages) => stages.map((s) => ({
        ...s,
        leads: s.id === lead.pipelineStage ? [leadId, ...s.leads.filter((id) => id !== leadId)] : s.leads.filter((id) => id !== leadId),
      })));
      return { ok: false, error: json.error || 'Não foi possível mover o lead.' };
    }
    return { ok: true };
  };

  // ─── savePipelineStructure (etapas: nome, cor, ordem) ───────
  // A tela muda na hora; a gravação vai para /api/pipeline/stages. Ao
  // digitar o nome de uma etapa, espera uma pausa antes de salvar.
  const stageSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStages = useRef<PipelineStage[] | null>(null);

  const savePipelineStructure = (newStages: PipelineStage[], options: { debounce?: boolean } = {}) => {
    setPipelineStages(newStages);
    if (!dbStatus) return;

    pendingStages.current = newStages;
    if (stageSaveTimer.current) clearTimeout(stageSaveTimer.current);
    stageSaveTimer.current = setTimeout(async () => {
      const stagesToSave = pendingStages.current;
      pendingStages.current = null;
      if (!stagesToSave) return;
      const { ok, json } = await send('/api/pipeline/stages', 'PUT', {
        stages: stagesToSave.map((stage) => ({ id: stage.id, name: stage.name, color: stage.color })),
      });
      if (!ok) {
        setStructureError(json.error || 'Não foi possível salvar as etapas do funil.');
        await fetchDatabase(); // volta para o que está salvo
        return;
      }
      // Leads de etapas excluídas mudaram de etapa no servidor.
      if (json.data?.movedLeads > 0) await fetchDatabase();
    }, options.debounce ? 700 : 0);
  };

  return (
    <LeadContext.Provider value={{
      leads, pipelineStages, loaded, isModalOpen,
      openModal, modalDefaults, lastCreatedLeadId, closeModal,
      addLead, updateLead, deleteLead, bulkUpdate,
      tags, refreshTags,
      moveLead, structureError, clearStructureError: () => setStructureError(''),
      savePipelineStructure,
      dbStatus, refreshDatabase: fetchDatabase,
    }}>
      {children}
    </LeadContext.Provider>
  );
};
