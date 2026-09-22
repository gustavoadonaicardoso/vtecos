/**
 * ============================================================
 * VÓRTICE CRM — Tenants Service
 * ============================================================
 * Operações de banco para gestão multi-tenant (painel Master).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

export async function fetchTenants(): Promise<ServiceResult<any[]>> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createTenant(name: string): Promise<ServiceResult<any>> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({ name: name.trim(), status: 'ACTIVE' })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
