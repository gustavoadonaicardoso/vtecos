/**
 * ============================================================
 * VÓRTICE CRM — Estrutura do funil (etapas do pipeline)
 * ============================================================
 * Grava a lista completa de etapas na ordem em que aparecem: cria as
 * novas, atualiza nome/cor/posição das existentes e remove as que
 * saíram. Leads de uma etapa removida vão para a primeira etapa da
 * lista (leads.stage_id é obrigatório e referencia pipeline_stages).
 * Server-only (supabaseAdmin).
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

/** Etapa de "ganho": métricas, metas e relatórios dependem dela. */
export const WON_STAGE_ID = 'ganho';

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;
const MAX_STAGES = 30;

export interface StageInput {
  id: string;
  name: string;
  color: string;
}

export function parseStagesInput(body: unknown): { stages: StageInput[] } | { error: string } {
  const raw = (body as { stages?: unknown })?.stages;
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'O funil precisa ter pelo menos uma etapa.' };
  if (raw.length > MAX_STAGES) return { error: `O funil pode ter no máximo ${MAX_STAGES} etapas.` };

  const stages: StageInput[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = typeof item?.id === 'string' ? item.id : '';
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const color = typeof item?.color === 'string' ? item.color : '';
    if (!ID_PATTERN.test(id) || seen.has(id)) return { error: 'Etapa com identificador inválido.' };
    if (!name) return { error: 'Toda etapa precisa de um nome.' };
    if (name.length > 60) return { error: 'O nome da etapa pode ter no máximo 60 caracteres.' };
    seen.add(id);
    stages.push({ id, name, color: COLOR_PATTERN.test(color) ? color : '#3b82f6' });
  }
  return { stages };
}

export async function savePipelineStages(tenantId: string, stages: StageInput[]): Promise<ServiceResult<{ movedLeads: number }>> {
  const { data: existing, error: existingError } = await supabaseAdmin.from('pipeline_stages').select('id').eq('tenant_id', tenantId);
  if (existingError) return { success: false, error: existingError.message };

  const incomingIds = new Set(stages.map((stage) => stage.id));
  const removed = (existing || []).map((row) => row.id as string).filter((id) => !incomingIds.has(id));

  if (removed.includes(WON_STAGE_ID)) {
    return { success: false, error: 'A etapa "Ganhos" não pode ser excluída: metas, relatórios e o dashboard dependem dela. Você pode renomear ou mudar a cor.' };
  }

  // 1. Cria/atualiza na ordem nova (precisa vir antes de mover leads para a etapa de destino).
  const rows = stages.map((stage, index) => ({ tenant_id: tenantId, id: stage.id, name: stage.name, color: stage.color, position: index + 1 }));
  // Etapas são únicas por empresa (tenant_id + id).
  const { error: upsertError } = await supabaseAdmin.from('pipeline_stages').upsert(rows, { onConflict: 'tenant_id,id' });
  if (upsertError) return { success: false, error: upsertError.message };

  let movedLeads = 0;
  if (removed.length > 0) {
    // 2. Leads das etapas removidas vão para a primeira etapa do funil.
    const fallback = stages[0].id;
    const { data: moved, error: moveError } = await supabaseAdmin
      .from('leads')
      .update({ stage_id: fallback })
      .eq('tenant_id', tenantId)
      .in('stage_id', removed)
      .select('id');
    if (moveError) return { success: false, error: moveError.message };
    movedLeads = moved?.length ?? 0;

    // 3. Agora as etapas removidas podem sair sem violar a chave estrangeira.
    const { error: deleteError } = await supabaseAdmin.from('pipeline_stages').delete().eq('tenant_id', tenantId).in('id', removed);
    if (deleteError) return { success: false, error: deleteError.message };
  }

  return { success: true, data: { movedLeads } };
}

/** Funil inicial de uma empresa nova (mesmas etapas que a Vórtice começou). */
export const DEFAULT_STAGES: StageInput[] = [
  { id: 'novo', name: 'Novo lead', color: '#3b82f6' },
  { id: 'contato', name: 'Em contato', color: '#8b5cf6' },
  { id: 'proposta', name: 'Proposta', color: '#f59e0b' },
  { id: WON_STAGE_ID, name: 'Ganhos', color: '#10b981' },
];

export async function seedDefaultStages(tenantId: string) {
  const { count } = await supabaseAdmin.from('pipeline_stages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (count) return;
  await supabaseAdmin.from('pipeline_stages').insert(
    DEFAULT_STAGES.map((stage, index) => ({ ...stage, tenant_id: tenantId, position: index + 1 }))
  );
}
