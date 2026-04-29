/**
 * ============================================================
 * VÓRTICE CRM — Lead Service
 * ============================================================
 * Responsável por TODAS as operações de banco relacionadas
 * a Leads e Pipeline Stages. Nenhum componente ou context
 * deve fazer queries Supabase diretamente para leads.
 * ============================================================
 */

import { supabase } from '@/lib/supabase';
import { Lead, PipelineStage, ServiceResult } from '@/types';

// ─── Mapeamento de dados do banco → tipo Lead ─────────────────

function mapDbRowToLead(row: any): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    cpfCnpj: row.cpf_cnpj || '',
    value: `R$ ${(row.value || 0).toLocaleString('pt-BR')}`,
    pipelineStage: row.stage_id,
    tags: row.tags || ['Lead'],
    channels: ['whatsapp'],
    status: 'Ativo',
    color: '#3b82f6',
    lastMsg: row.last_msg || 'Hoje',
    entryDate: new Date(row.created_at).toLocaleDateString('pt-BR'),
    source: row.source || 'Site',
    waitTime: row.wait_time_minutes || 0,
    handlingTime: row.handling_time_minutes || 0,
  };
}

// ─── Mapeamento Lead → campos de atualização do banco ─────────

function mapLeadUpdateToDb(updates: Partial<Lead>): Record<string, any> {
  const db: Record<string, any> = {};
  if (updates.name !== undefined) db.name = updates.name;
  if (updates.email !== undefined) db.email = updates.email;
  if (updates.phone !== undefined) db.phone = updates.phone;
  if (updates.cpfCnpj !== undefined) db.cpf_cnpj = updates.cpfCnpj;
  if (updates.pipelineStage !== undefined) db.stage_id = updates.pipelineStage;
  if (updates.value !== undefined) {
    const raw = String(updates.value || '0');
    db.value = parseFloat(raw.replace(/[^0-9,-]+/g, '').replace(',', '.') || '0');
  }
  return db;
}

// ─── CRUD de Leads ────────────────────────────────────────────

/**
 * Busca todos os leads e stages do banco.
 * Retorna dados mapeados para o formato da aplicação.
 */
export async function fetchLeadsAndStages(): Promise<{
  leads: Lead[];
  stages: PipelineStage[];
} | null> {
  try {
    const [stagesRes, leadsRes] = await Promise.all([
      supabase.from('pipeline_stages').select('*').order('position'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
    ]);

    if (stagesRes.error || leadsRes.error) return null;
    if (!stagesRes.data || !leadsRes.data) return null;

    const leads = leadsRes.data.map(mapDbRowToLead);

    const stages: PipelineStage[] = stagesRes.data.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      leads: leads.filter((l) => l.pipelineStage === s.id).map((l) => l.id),
    }));

    return { leads, stages };
  } catch (err) {
    console.error('[LeadService] fetchLeadsAndStages:', err);
    return null;
  }
}

/**
 * Cria um novo lead no banco e retorna o objeto mapeado.
 */
export async function createLead(
  leadData: Omit<Lead, 'id' | 'entryDate' | 'status' | 'color' | 'channels' | 'lastMsg'>
): Promise<ServiceResult<Lead>> {
  try {
    const raw = String(leadData.value || '0');
    const numericValue = parseFloat(raw.replace(/[^0-9,-]+/g, '').replace(',', '.') || '0');

    const { data, error } = await supabase
      .from('leads')
      .insert([{
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        cpf_cnpj: leadData.cpfCnpj,
        value: numericValue,
        stage_id: leadData.pipelineStage,
      }])
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Erro ao criar lead' };
    }

    const newLead: Lead = {
      ...leadData,
      id: data.id,
      entryDate: new Date(data.created_at).toLocaleDateString('pt-BR'),
      status: 'Ativo',
      color: '#10b981',
      channels: ['whatsapp'],
      lastMsg: 'Agora mesmo',
    };

    return { success: true, data: newLead };
  } catch (err: any) {
    console.error('[LeadService] createLead:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Atualiza campos de um lead no banco.
 */
export async function updateLeadInDb(
  leadId: string,
  updates: Partial<Lead>
): Promise<ServiceResult> {
  try {
    const dbUpdates = mapLeadUpdateToDb(updates);
    if (Object.keys(dbUpdates).length === 0) return { success: true };

    const { error } = await supabase
      .from('leads')
      .update(dbUpdates)
      .eq('id', leadId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[LeadService] updateLeadInDb:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Move um lead para outra stage no banco.
 */
export async function moveLeadToStage(
  leadId: string,
  stageId: string
): Promise<ServiceResult> {
  try {
    const { error } = await supabase
      .from('leads')
      .update({ stage_id: stageId })
      .eq('id', leadId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[LeadService] moveLeadToStage:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Remove um lead permanentemente do banco.
 */
export async function deleteLeadFromDb(leadId: string): Promise<ServiceResult> {
  try {
    const { error } = await supabase.from('leads').delete().eq('id', leadId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[LeadService] deleteLeadFromDb:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Verifica se um ID é local (mock/dev) ou real (banco UUID).
 * IDs mock seguem o padrão 'lead-<número>'.
 */
export function isLocalLeadId(leadId: string): boolean {
  return leadId.startsWith('lead-');
}
