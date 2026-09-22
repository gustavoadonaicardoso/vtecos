"use client";

import { GOALS_STORAGE_KEY, type GoalPlan } from './goals';

const MIGRATION_FLAG_KEY = 'vortice_goals_migrated';

export async function fetchGoalsFromServer(userId: string): Promise<GoalPlan[]> {
  const res = await fetch('/api/goals', { headers: { 'x-user-id': userId }, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || 'Não foi possível carregar as metas.');
  }
  return Array.isArray(json.data) ? json.data : [];
}

export async function createGoalOnServer(userId: string, goal: GoalPlan): Promise<GoalPlan> {
  const res = await fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify(goal),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Não foi possível criar o planejamento.');
  return json.data;
}

export async function updateGoalOnServer(userId: string, id: string, updates: Partial<GoalPlan>): Promise<GoalPlan> {
  const res = await fetch(`/api/goals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify(updates),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Não foi possível atualizar o planejamento.');
  return json.data;
}

export async function deleteGoalOnServer(userId: string, id: string): Promise<void> {
  const res = await fetch(`/api/goals/${id}`, {
    method: 'DELETE',
    headers: { 'x-user-id': userId },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Não foi possível excluir o planejamento.');
}

/**
 * Metas viviam só no localStorage deste navegador antes da tabela `goals`
 * existir. Roda uma única vez por navegador: envia para o servidor as metas
 * criadas pelo usuário atual que ainda estejam presas localmente.
 */
export async function migrateLocalGoalsIfAny(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;

  const raw = localStorage.getItem(GOALS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const goal of parsed) {
          if (!goal || goal.ownerId !== userId) continue;
          try {
            await createGoalOnServer(userId, goal);
          } catch {
            // Provavelmente já migrada em uma visita anterior, ou falha
            // pontual — não bloqueia o restante da migração.
          }
        }
      }
    } catch {
      // localStorage corrompido: nada a migrar.
    }
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, '1');
}
