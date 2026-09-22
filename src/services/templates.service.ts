/**
 * ============================================================
 * VÓRTICE CRM — Message Templates Service
 * ============================================================
 * Responsável por todas as operações de banco relacionadas a
 * templates de mensagem (tabela message_templates).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

/**
 * Lista templates ativos. Se `userId` for informado, filtra pelo
 * allowed_templates do perfil (array vazio = acesso a todos).
 */
export async function fetchVisibleTemplates(userId?: string | null) {
  const { data: templates, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) return { success: false as const, error: error.message };

  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('allowed_templates')
      .eq('id', userId)
      .single();

    const allowed: string[] = profile?.allowed_templates ?? [];
    const visible = allowed.length > 0
      ? (templates ?? []).filter((t: any) => allowed.includes(t.id))
      : (templates ?? []);

    return { success: true as const, data: visible };
  }

  return { success: true as const, data: templates ?? [] };
}

export async function createTemplate(name: string, content: string): Promise<ServiceResult> {
  const { data, error } = await supabase
    .from('message_templates')
    .insert([{ name: name.trim(), content: content.trim() }])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateTemplate(id: string, updates: { name?: string; content?: string }): Promise<ServiceResult> {
  const { error } = await supabase
    .from('message_templates')
    .update(updates)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Soft delete — marca o template como inativo em vez de apagar. */
export async function deactivateTemplate(id: string): Promise<ServiceResult> {
  const { error } = await supabase
    .from('message_templates')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
