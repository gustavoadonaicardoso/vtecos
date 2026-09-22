/**
 * ============================================================
 * VÓRTICE CRM — Projects (Planos de Ação) Service
 * ============================================================
 * Operações de banco para a tela de Projetos (tabela action_plans).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

export interface ProjectRequester {
  role: string;
  status: string;
  permissions: any;
}

/** Busca o perfil de quem fez a requisição, para checagem de permissão na rota. */
export async function fetchRequesterProfile(requesterId: string): Promise<ProjectRequester | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, status, permissions')
    .eq('id', requesterId)
    .maybeSingle();

  if (error || !data || data.status !== 'ACTIVE') return null;
  return data;
}

export async function fetchProjects(): Promise<ServiceResult<any[]>> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('*')
    .order('created_at');

  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}

/**
 * Substitui todos os projetos pela lista informada (limpa e reinsere).
 * Reflete o comportamento original da tela: "salvar tudo" em bloco.
 */
export async function replaceProjects(projects: any[]): Promise<ServiceResult> {
  const rows = projects.map((project) => ({
    client_name: String(project.clientName || ''),
    project_name: String(project.projectName || ''),
    status: String(project.status || 'Planejamento'),
    strategies: String(project.strategies || ''),
    weekly_goals: String(project.weeklyGoals || ''),
    commercial_points: String(project.commercialPoints || ''),
    color_gradient: String(project.color || ''),
  }));

  const { error: deleteError } = await supabase
    .from('action_plans')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteError) return { success: false, error: deleteError.message };

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('action_plans').insert(rows);
    if (insertError) return { success: false, error: insertError.message };
  }

  return { success: true };
}
