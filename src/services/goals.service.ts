import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';
import { canViewGoal, type GoalPlan } from '@/lib/goals';

export interface GoalRequester {
  id: string;
  role: string;
  status: string;
}

function mapRow(row: any): GoalPlan {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    type: row.type,
    metric: row.metric,
    targetValue: Number(row.target_value),
    deadline: row.deadline || '',
    stageIds: row.stage_ids || [],
    visibility: row.visibility,
    viewerIds: row.viewer_ids || [],
    ownerId: row.owner_id,
    tasks: row.tasks || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchRequesterProfile(requesterId: string): Promise<GoalRequester | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, status')
    .eq('id', requesterId)
    .maybeSingle();

  if (error || !data || data.status !== 'ACTIVE') return null;
  return data;
}

export async function fetchVisibleGoals(requester: GoalRequester): Promise<ServiceResult<GoalPlan[]>> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };

  const isAdmin = requester.role === 'ADMIN';
  const goals = (data || [])
    .map(mapRow)
    .filter(goal => canViewGoal(goal, requester.id, isAdmin));

  return { success: true, data: goals };
}

export async function createGoal(goal: GoalPlan): Promise<ServiceResult<GoalPlan>> {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      type: goal.type,
      metric: goal.metric,
      target_value: goal.targetValue,
      deadline: goal.deadline || null,
      stage_ids: goal.stageIds,
      visibility: goal.visibility,
      viewer_ids: goal.viewerIds,
      owner_id: goal.ownerId,
      tasks: goal.tasks,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: mapRow(data) };
}

export async function updateGoal(id: string, updates: Partial<GoalPlan>): Promise<ServiceResult<GoalPlan>> {
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.type !== undefined) patch.type = updates.type;
  if (updates.metric !== undefined) patch.metric = updates.metric;
  if (updates.targetValue !== undefined) patch.target_value = updates.targetValue;
  if (updates.deadline !== undefined) patch.deadline = updates.deadline || null;
  if (updates.stageIds !== undefined) patch.stage_ids = updates.stageIds;
  if (updates.visibility !== undefined) patch.visibility = updates.visibility;
  if (updates.viewerIds !== undefined) patch.viewer_ids = updates.viewerIds;
  if (updates.tasks !== undefined) patch.tasks = updates.tasks;

  const { data, error } = await supabase
    .from('goals')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: mapRow(data) };
}

export async function deleteGoal(id: string): Promise<ServiceResult<null>> {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: null };
}

export async function fetchGoalOwner(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('goals').select('owner_id').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data.owner_id;
}
