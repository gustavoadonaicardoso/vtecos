/**
 * Páginas públicas por empresa (Totem e Painel de senhas): a URL leva a
 * chave da empresa (tenants.display_key). Sem chave válida, nada aparece
 * -- e um totem nunca enxerga a fila de outra empresa.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadWorkspace } from '@/services/workspace.service';

export interface PublicTenant {
  id: string;
  name: string;
}

export async function resolveTenantByDisplayKey(key: unknown, module = 'senhas'): Promise<PublicTenant | null> {
  if (typeof key !== 'string' || !/^[0-9a-f]{16,64}$/i.test(key)) return null;
  const { data } = await supabaseAdmin.from('tenants').select('id, name').eq('display_key', key).maybeSingle();
  if (!data) return null;

  const workspace = await loadWorkspace({ tenant_id: data.id });
  if (!workspace || !workspace.modules.includes(module)) return null;
  return { id: data.id, name: data.name };
}

/** Chave do totem/painel da empresa (para a recepção montar os links). */
export async function displayKeyOf(tenantId: string) {
  const { data } = await supabaseAdmin.from('tenants').select('display_key').eq('id', tenantId).maybeSingle();
  return (data?.display_key as string | undefined) ?? null;
}
