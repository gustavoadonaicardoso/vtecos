"use client";

/**
 * ============================================================
 * VÓRTICE CRM — LeadContext
 * ============================================================
 * Estado global de Leads e Pipeline.
 * Toda lógica de banco foi delegada para @/services/leads.service.ts.
 * Este context lida apenas com estado React e UI.
 * ============================================================
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

// Tipos agora vêm do arquivo centralizado
import type { Lead, PipelineStage } from '@/types';

// Re-exporta os tipos para compatibilidade com imports existentes
export type { Lead, PipelineStage };

// Helper isLocalLeadId mantido local no frontend para mocks
const isLocalLeadId = (id: string) => id.startsWith('lead-');

// ─── Mock data (apenas em desenvolvimento) ────────────────────

const IS_DEV = process.env.NODE_ENV === 'development';

const DEV_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'novo', name: 'Novos Leads', color: '#3b82f6', leads: ['lead-1', 'lead-2'] },
  { id: 'contato', name: 'Primeiro Contato', color: '#8b5cf6', leads: ['lead-3'] },
  { id: 'negociacao', name: 'Negociação', color: '#f59e0b', leads: ['lead-4'] },
  { id: 'proposta', name: 'Proposta Enviada', color: '#8b5cf6', leads: ['lead-6'] },
  { id: 'ganho', name: 'Ganhos', color: '#10b981', leads: ['lead-5'] },
];

const DEV_LEADS: Lead[] = [
  { id: 'lead-1', name: 'Mário Lima', cpfCnpj: '', email: 'mario@terra.com', phone: '(11) 99876-5432', tags: ['Quente', 'SSD'], pipelineStage: 'novo', entryDate: '26/03/2026', lastMsg: '2 min atrás', status: 'Ativo', color: '#3b82f6', channels: ['whatsapp', 'instagram'], value: 'R$ 15.000', days: 2 },
  { id: 'lead-2', name: 'Ana Souza', cpfCnpj: '', email: 'ana@gmail.com', phone: '(21) 98765-4321', tags: ['Frio'], pipelineStage: 'novo', entryDate: '25/03/2026', lastMsg: '1h atrás', status: 'Ativo', color: '#10b981', channels: ['whatsapp'], value: 'R$ 8.500', days: 1 },
  { id: 'lead-3', name: 'Roberto Carlos', cpfCnpj: '', email: 'roberto@globo.com', phone: '(31) 97654-3210', tags: ['Inativa'], pipelineStage: 'contato', entryDate: '24/03/2026', lastMsg: '1 dia atrás', status: 'Bloqueado', color: '#ef4444', channels: ['facebook'], value: 'R$ 25.000', days: 4 },
  { id: 'lead-4', name: 'Juliana Paes', cpfCnpj: '', email: 'juh@gmail.com', phone: '(11) 91234-5678', tags: ['VIP', 'SSD'], pipelineStage: 'negociacao', entryDate: '23/03/2026', lastMsg: '5 min atrás', status: 'Ativo', color: '#8b5cf6', channels: ['instagram', 'site'], value: 'R$ 45.000', days: 12 },
  { id: 'lead-5', name: 'Fabio T.', cpfCnpj: '', email: 'fabio@techhub.io', phone: '(41) 92345-6789', tags: ['Ganhos'], pipelineStage: 'ganho', entryDate: '22/03/2026', lastMsg: '3h atrás', status: 'Ativo', color: '#f59e0b', channels: ['whatsapp'], value: 'R$ 12.000', days: 20 },
  { id: 'lead-6', name: 'Daniel K.', cpfCnpj: '', email: 'daniel@solucaotech.com', phone: '(51) 99888-7777', tags: ['Proposta'], pipelineStage: 'proposta', entryDate: '20/03/2026', lastMsg: '2 dias atrás', status: 'Ativo', color: '#3b82f6', channels: ['whatsapp', 'email'], value: 'R$ 30.000', days: 3 },
];

// Estado inicial: mocks só em dev, vazio em produção
const INITIAL_LEADS: Lead[] = IS_DEV ? DEV_LEADS : [];
const INITIAL_STAGES: PipelineStage[] = IS_DEV ? DEV_PIPELINE_STAGES : [
  { id: 'novo', name: 'Novos Leads', color: '#3b82f6', leads: [] },
  { id: 'contato', name: 'Primeiro Contato', color: '#8b5cf6', leads: [] },
  { id: 'negociacao', name: 'Negociação', color: '#f59e0b', leads: [] },
  { id: 'proposta', name: 'Proposta Enviada', color: '#8b5cf6', leads: [] },
  { id: 'ganho', name: 'Ganhos', color: '#10b981', leads: [] },
];

// ─── Context type ──────────────────────────────────────────────

type LeadContextType = {
  leads: Lead[];
  pipelineStages: PipelineStage[];
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  addLead: (leadData: Omit<Lead, 'id' | 'entryDate' | 'status' | 'color' | 'channels' | 'lastMsg'>) => void;
  updateLead: (leadId: string, updates: Partial<Lead>) => void;
  deleteLead: (leadId: string) => void;
  tags: string[];
  addTag: (tag: string) => void;
  deleteTag: (tag: string) => void;
  updatePipelineStages: (newStages: PipelineStage[]) => void;
  dbStatus: boolean;
  refreshDatabase: () => Promise<void>;
};

const LeadContext = createContext<LeadContextType | undefined>(undefined);

export const useLeads = () => {
  const context = useContext(LeadContext);
  if (!context) throw new Error('useLeads must be used within a LeadProvider');
  return context;
};

// ─── Provider ─────────────────────────────────────────────────

export const LeadProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>(INITIAL_STAGES);
  const [tags, setTags] = useState<string[]>(['Quente', 'Frio', 'VIP', 'SSD', 'Inativa', 'Ganhos', 'Proposta']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState(false);

  // Busca dados do banco via API
  const fetchDatabase = useCallback(async () => {
    try {
      const resp = await fetch('/api/leads');
      if (resp.ok) {
        const { data } = await resp.json();
        setDbStatus(true);
        setLeads(data.leads);
        if (data.stages.length > 0) setPipelineStages(data.stages);
      }
    } catch (e) {
      console.error('Falha ao buscar leads via API', e);
    }
  }, []);

  useEffect(() => {
    fetchDatabase();
    if (!supabase) return;

    // Realtime: qualquer mudança em leads ou stages refaz o fetch
    const channel = supabase
      .channel('leads_realtime_changes')
      .on('postgres_changes', { event: '*', table: 'leads', schema: 'public' }, fetchDatabase)
      .on('postgres_changes', { event: '*', table: 'pipeline_stages', schema: 'public' }, fetchDatabase)
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [fetchDatabase]);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  // ─── addLead ────────────────────────────────────────────────
  const addLead = async (leadData: Omit<Lead, 'id' | 'entryDate' | 'status' | 'color' | 'channels' | 'lastMsg'>) => {
    if (dbStatus) {
      try {
        const resp = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadData)
        });
        
        if (resp.ok) {
          const { data: newLead } = await resp.json();

          // Log remoto
          fetch('/api/audit', {
            method: 'POST',
            body: JSON.stringify({
              user,
              action: 'LEAD_CREATE',
              details: `Lead ${newLead.name} criado manualmente.`,
              entityType: 'lead',
              entityId: newLead.id
            })
          }).catch(() => {});

          setLeads((prev) => [newLead, ...prev]);
          setPipelineStages((prev) =>
            prev.map((s) => s.id === newLead.pipelineStage ? { ...s, leads: [newLead.id, ...s.leads] } : s)
          );
          return;
        }
      } catch (e) {
         console.error('Falha ao criar lead via API');
      }
    }

    // Fallback local (dev ou sem banco)
    const newLeadId = `lead-${Date.now()}`;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
    const newLead: Lead = {
      ...leadData,
      id: newLeadId,
      entryDate: new Date().toLocaleDateString('pt-BR'),
      status: 'Ativo',
      color: colors[Math.floor(Math.random() * colors.length)],
      channels: ['whatsapp'],
      lastMsg: 'Agora mesmo',
    };
    setLeads((prev) => [newLead, ...prev]);
    setPipelineStages((prev) =>
      prev.map((s) => s.id === leadData.pipelineStage ? { ...s, leads: [newLeadId, ...s.leads] } : s)
    );
  };

  // ─── updateLead ─────────────────────────────────────────────
  const updateLead = async (leadId: string, updates: Partial<Lead>) => {
    // Persiste no banco somente para IDs reais (não mocks locais)
    if (dbStatus && !isLocalLeadId(leadId)) {
      try {
        await fetch(`/api/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });

        fetch('/api/audit', {
          method: 'POST',
          body: JSON.stringify({
            user,
            action: 'LEAD_UPDATE',
            details: `Lead ${leadId} atualizado. Campos: ${Object.keys(updates).join(', ')}`,
            entityType: 'lead',
            entityId: leadId
          })
        }).catch(() => {});
      } catch (e) {}
    }
    // Atualiza estado local imediatamente (optimistic update)
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, ...updates } : l));
  };

  // ─── deleteLead ─────────────────────────────────────────────
  const deleteLead = async (leadId: string) => {
    if (dbStatus && !isLocalLeadId(leadId)) {
      try {
        await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });

        fetch('/api/audit', {
          method: 'POST',
          body: JSON.stringify({
             user,
             action: 'LEAD_DELETE',
             details: `Lead ${leadId} removido permanentemente.`,
             entityType: 'lead',
             entityId: leadId
          })
        }).catch(() => {});
      } catch (e) {}
    }
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setPipelineStages((prev) =>
      prev.map((s) => ({ ...s, leads: s.leads.filter((id) => id !== leadId) }))
    );
  };

  // ─── updatePipelineStages (drag & drop) ─────────────────────
  const updatePipelineStages = async (newStages: PipelineStage[]) => {
    if (dbStatus) {
      // Detecta qual lead foi movido e para qual stage
      for (const newStage of newStages) {
        const oldStage = pipelineStages.find((s) => s.id === newStage.id);
        if (oldStage) {
          const addedLeads = newStage.leads.filter((id) => !oldStage.leads.includes(id));
          if (addedLeads.length > 0) {
            const movedId = addedLeads[0];
            if (!isLocalLeadId(movedId)) {
              try {
                await fetch(`/api/leads/${movedId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'move_stage', stageId: newStage.id })
                });
              } catch(e) {}
            }
            break;
          }
        }
      }
    }
    setPipelineStages(newStages);
  };

  // ─── Tags ────────────────────────────────────────────────────
  const addTag = (tag: string) => {
    if (!tags.includes(tag)) setTags((prev) => [...prev, tag]);
  };
  const deleteTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  return (
    <LeadContext.Provider value={{
      leads, pipelineStages, isModalOpen,
      openModal, closeModal,
      addLead, updateLead, deleteLead,
      tags, addTag, deleteTag,
      updatePipelineStages,
      dbStatus, refreshDatabase: fetchDatabase,
    }}>
      {children}
    </LeadContext.Provider>
  );
};
