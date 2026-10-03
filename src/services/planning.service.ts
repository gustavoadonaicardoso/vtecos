/**
 * ============================================================
 * VÓRTICE CRM — Planejamentos (funis visuais) Service
 * ============================================================
 * Operações de banco para o módulo de Planejamentos (tabela
 * planning_boards). Client-side nunca fala com o Supabase direto
 * aqui -- tudo passa pelas rotas /api/planejamentos/*, que chamam
 * estas funções com o client de service role.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';
import type { PlanningBoard, PlanningCanvasData } from '@/app/planejamentos/types';
import { EMPTY_CANVAS_DATA } from '@/app/planejamentos/types';

const SELECT_WITH_PROJECT = '*, project:action_plans(project_name, client_name)';

function mapBoard(row: any): PlanningBoard {
  const { project, ...rest } = row;
  return {
    ...rest,
    project_name: project ? `${project.client_name} — ${project.project_name}` : null,
  };
}

export async function fetchBoards(tenantId: string): Promise<ServiceResult<PlanningBoard[]>> {
  const { data, error } = await supabaseAdmin
    .from('planning_boards')
    .select(SELECT_WITH_PROJECT)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []).map(mapBoard) };
}

export async function fetchBoardById(tenantId: string, id: string): Promise<ServiceResult<PlanningBoard>> {
  const { data, error } = await supabaseAdmin
    .from('planning_boards')
    .select(SELECT_WITH_PROJECT)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Planejamento não encontrado.' };
  return { success: true, data: mapBoard(data) };
}

/** Usado pela rota pra checar quem criou o board antes de permitir excluir. */
export async function fetchBoardOwner(tenantId: string, id: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('planning_boards')
    .select('created_by')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  return data?.created_by ?? null;
}

/** Projeto vinculado precisa ser da mesma empresa. */
async function projectInTenant(tenantId: string, projectId: string | null | undefined) {
  if (!projectId) return true;
  const { data } = await supabaseAdmin.from('action_plans').select('id').eq('tenant_id', tenantId).eq('id', projectId).maybeSingle();
  return Boolean(data);
}

export async function createBoard(tenantId: string, input: {
  name?: string;
  description?: string;
  project_id?: string | null;
  canvas_data?: PlanningCanvasData;
  created_by: string;
}): Promise<ServiceResult<PlanningBoard>> {
  if (!(await projectInTenant(tenantId, input.project_id))) return { success: false, error: 'Projeto não encontrado.' };
  const { data, error } = await supabaseAdmin
    .from('planning_boards')
    .insert([{
      tenant_id: tenantId,
      name: input.name?.trim() || 'Novo planejamento',
      description: input.description || '',
      project_id: input.project_id || null,
      canvas_data: input.canvas_data || EMPTY_CANVAS_DATA,
      created_by: input.created_by,
    }])
    .select(SELECT_WITH_PROJECT)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: mapBoard(data) };
}

export async function updateBoard(
  tenantId: string,
  id: string,
  updates: { name?: string; description?: string; project_id?: string | null; canvas_data?: PlanningCanvasData; thumbnail_url?: string | null }
): Promise<ServiceResult<PlanningBoard>> {
  if (!(await projectInTenant(tenantId, updates.project_id))) return { success: false, error: 'Projeto não encontrado.' };
  const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };

  const { data, error } = await supabaseAdmin
    .from('planning_boards')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(SELECT_WITH_PROJECT)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: mapBoard(data) };
}

export async function deleteBoard(tenantId: string, id: string): Promise<ServiceResult> {
  const { error } = await supabaseAdmin.from('planning_boards').delete().eq('tenant_id', tenantId).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function duplicateBoard(tenantId: string, id: string, createdBy: string): Promise<ServiceResult<PlanningBoard>> {
  const original = await fetchBoardById(tenantId, id);
  if (!original.success || !original.data) {
    return { success: false, error: original.error || 'Planejamento não encontrado.' };
  }

  return createBoard(tenantId, {
    name: `${original.data.name} (cópia)`,
    description: original.data.description,
    project_id: original.data.project_id,
    canvas_data: original.data.canvas_data,
    created_by: createdBy,
  });
}
