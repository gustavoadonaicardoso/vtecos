/**
 * ============================================================
 * VÓRTICE CRM — Projects (Planos de Ação) Service
 * ============================================================
 * Operações de banco para a tela de Projetos (tabela action_plans).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

export async function fetchProjects(tenantId: string): Promise<ServiceResult<Record<string, unknown>[]>> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at');

  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}

/**
 * Substitui todos os projetos pela lista informada (limpa e reinsere).
 * Reflete o comportamento original da tela: "salvar tudo" em bloco.
 */
export async function replaceProjects(tenantId: string, projects: Record<string, unknown>[]): Promise<ServiceResult> {
  const rows = projects.map((project) => ({
    tenant_id: tenantId,
    client_name: String(project.clientName || ''),
    project_name: String(project.projectName || ''),
    status: String(project.status || 'Planejamento'),
    strategies: String(project.strategies || ''),
    weekly_goals: String(project.weeklyGoals || ''),
    commercial_points: String(project.commercialPoints || ''),
    color_gradient: String(project.color || ''),
  }));

  // Só os projetos DESTA empresa são substituídos.
  const { error: deleteError } = await supabase
    .from('action_plans')
    .delete()
    .eq('tenant_id', tenantId);

  if (deleteError) return { success: false, error: deleteError.message };

  if (rows.length > 0) {
    // tenant-scope: ok (cada linha de rows leva tenant_id)
    const { error: insertError } = await supabase.from('action_plans').insert(rows);
    if (insertError) return { success: false, error: insertError.message };
  }

  return { success: true };
}
