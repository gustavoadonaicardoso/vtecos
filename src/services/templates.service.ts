/**
 * ============================================================
 * VÓRTICE CRM — Message Templates Service
 * ============================================================
 * Templates de mensagem (tabela message_templates), sempre da empresa
 * da sessão.
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

/**
 * Lista templates ativos da empresa, filtrados pelo allowed_templates do
 * usuário (array vazio = acesso a todos).
 */
export async function fetchVisibleTemplates(tenantId: string, userId: string) {
  const { data: templates, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) return { success: false as const, error: error.message };

  const { data: profile } = await supabase
    .from('profiles')
    .select('allowed_templates')
    .eq('tenant_id', tenantId)
    .eq('id', userId)
    .single();

  const allowed: string[] = profile?.allowed_templates ?? [];
  const visible = allowed.length > 0
    ? (templates ?? []).filter((t: { id: string }) => allowed.includes(t.id))
    : (templates ?? []);

  return { success: true as const, data: visible };
}

export async function createTemplate(tenantId: string, name: string, content: string): Promise<ServiceResult> {
  const { data, error } = await supabase
    .from('message_templates')
    .insert([{ tenant_id: tenantId, name: name.trim(), content: content.trim() }])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateTemplate(tenantId: string, id: string, updates: { name?: string; content?: string }): Promise<ServiceResult> {
  const { error } = await supabase
    .from('message_templates')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Soft delete — marca o template como inativo em vez de apagar. */
export async function deactivateTemplate(tenantId: string, id: string): Promise<ServiceResult> {
  const { error } = await supabase
    .from('message_templates')
    .update({ is_active: false })
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
