/**
 * ============================================================
 * VÓRTICE CRM — Projects (Planos de Ação) Service
 * ============================================================
 * Operações de banco para a tela de Projetos (tabela action_plans).
 * Cada projeto é criado, editado e excluído sozinho: Planejamentos e
 * Redes Sociais apontam para o id dele, que não pode mudar.
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

export const PROJECT_STATUSES = ['Planejamento', 'Em Andamento', 'Pausado', 'Concluído'] as const;

export const PROJECT_COLORS = [
  'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ef4444, #991b1b)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #1e293b, #0f172a)',
  'linear-gradient(135deg, #06b6d4, #0891b2)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
];

type Row = Record<string, unknown>;

export async function fetchProjects(tenantId: string): Promise<ServiceResult<Row[]>> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at');

  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}

const text = (value: unknown, max: number) => String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

/** Dados da tela -> colunas do banco, com validação. `partial`: só o que veio. */
export function projectInputToDb(input: Row, { partial }: { partial: boolean }): { data: Row } | { error: string } {
  const data: Row = {};
  const has = (key: string) => !partial || key in input;

  if (has('projectName')) {
    const name = text(input.projectName, 120);
    if (!name) return { error: 'Dê um nome ao projeto.' };
    data.project_name = name;
  }
  if (has('clientName')) data.client_name = text(input.clientName, 120);
  if (has('status')) {
    const status = String(input.status ?? 'Planejamento');
    if (!(PROJECT_STATUSES as readonly string[]).includes(status)) return { error: 'Status inválido.' };
    data.status = status;
  }
  if (has('strategies')) data.strategies = text(input.strategies, 8000);
  if (has('weeklyGoals')) data.weekly_goals = text(input.weeklyGoals, 8000);
  if (has('commercialPoints')) data.commercial_points = text(input.commercialPoints, 8000);
  if (has('color')) {
    // A cor vai direto no estilo do cartão: só as da paleta.
    const color = String(input.color ?? '');
    data.color_gradient = PROJECT_COLORS.includes(color) ? color : PROJECT_COLORS[0];
  }
  return { data };
}

export async function createProject(tenantId: string, input: Row): Promise<ServiceResult<Row>> {
  const parsed = projectInputToDb(input, { partial: false });
  if ('error' in parsed) return { success: false, error: parsed.error };
  // tenant-scope: ok (a linha inserida leva tenant_id)
  const { data, error } = await supabase.from('action_plans').insert([{ ...parsed.data, tenant_id: tenantId }]).select().single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Row };
}

export async function updateProject(tenantId: string, id: string, input: Row): Promise<ServiceResult<Row>> {
  const parsed = projectInputToDb(input, { partial: true });
  if ('error' in parsed) return { success: false, error: parsed.error };
  if (Object.keys(parsed.data).length === 0) return { success: false, error: 'Nada para salvar.' };
  const { data, error } = await supabase.from('action_plans').update(parsed.data).eq('tenant_id', tenantId).eq('id', id).select().maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Projeto não encontrado.' };
  return { success: true, data: data as Row };
}

/** Exclui o projeto. Planejamentos e contas vinculados ficam, só perdem o vínculo. */
export async function deleteProject(tenantId: string, id: string): Promise<ServiceResult<{ name: string }>> {
  const { data, error } = await supabase.from('action_plans').delete().eq('tenant_id', tenantId).eq('id', id).select('project_name').maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Projeto não encontrado.' };
  return { success: true, data: { name: String(data.project_name || '') } };
}
