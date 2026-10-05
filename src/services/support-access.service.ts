/**
 * ============================================================
 * VTEC OS — Modo suporte (server-only)
 * ============================================================
 * Um administrador da Vórtice entra numa empresa cliente como
 * administrador, por tempo limitado e com motivo. Enquanto a sessão
 * estiver ativa:
 * - o servidor trata a pessoa como admin da empresa do cliente
 *   (profile.tenant_id = empresa do cliente);
 * - o banco faz o mesmo para o navegador: current_tenant_id() devolve a
 *   empresa do cliente (migration 202610160001), então nunca aparecem
 *   dados das duas empresas misturados;
 * - o Painel Master fica bloqueado (não é mais "da Vórtice").
 * Entrada e saída ficam na auditoria das duas empresas.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import type { SupportAccessInfo, UserProfile } from '@/types';

export const SUPPORT_ACCESS_HOURS = 2;
type Failure = { error: string; status: number };

async function isPlatformTenant(tenantId: string | null) {
  if (!tenantId) return false;
  // tenant-scope: ok (só confere se a empresa é a da plataforma)
  const { data } = await db.from('tenants').select('is_platform').eq('id', tenantId).maybeSingle();
  return data?.is_platform === true;
}

/** Sessão de suporte ativa desta pessoa (só admin ativo da Vórtice tem). */
export async function activeSupportAccess(profile: Pick<UserProfile, 'id' | 'role' | 'status' | 'tenant_id'>): Promise<SupportAccessInfo | null> {
  if (profile.role !== 'ADMIN' || profile.status !== 'ACTIVE') return null;
  const { data } = await db
    .from('support_access_sessions')
    .select('id, tenant_id, reason, started_at, expires_at')
    .eq('user_id', profile.id)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !(await isPlatformTenant(profile.tenant_id))) return null;
  // tenant-scope: ok (nome da empresa em que a pessoa entrou)
  const { data: tenant } = await db.from('tenants').select('name').eq('id', data.tenant_id).maybeSingle();
  return {
    session_id: data.id,
    tenant_id: data.tenant_id,
    tenant_name: String(tenant?.name || 'Empresa'),
    reason: String(data.reason || ''),
    started_at: data.started_at,
    expires_at: data.expires_at,
    home_tenant_id: String(profile.tenant_id),
  };
}

/** Perfil "dentro" da empresa do cliente quando o modo suporte está ativo. */
export async function applySupportAccess(profile: UserProfile): Promise<UserProfile> {
  const access = await activeSupportAccess(profile);
  if (!access) return profile;
  return { ...profile, tenant_id: access.tenant_id, role: 'ADMIN', support_access: access };
}

export async function startSupportAccess(realProfile: UserProfile, tenantId: unknown, reasonRaw: unknown): Promise<SupportAccessInfo | Failure> {
  if (realProfile.role !== 'ADMIN' || realProfile.status !== 'ACTIVE' || !(await isPlatformTenant(realProfile.tenant_id))) {
    return { error: 'Só administradores da Vórtice entram nas empresas clientes.', status: 403 };
  }
  if (typeof tenantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(tenantId)) return { error: 'Escolha a empresa.', status: 400 };
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 300) : '';
  if (reason.length < 5) return { error: 'Informe o motivo do acesso (fica registrado para o cliente).', status: 400 };

  // tenant-scope: ok (a Vórtice escolhe em qual empresa cliente entrar)
  const { data: tenant } = await db.from('tenants').select('id, name, status, is_platform').eq('id', tenantId).maybeSingle();
  if (!tenant) return { error: 'Empresa não encontrada.', status: 404 };
  if (tenant.is_platform) return { error: 'Você já está na empresa da Vórtice.', status: 400 };
  if (tenant.status !== 'ACTIVE') return { error: 'Esta empresa está suspensa. Reative em Empresas e Planos para entrar.', status: 409 };

  const now = new Date();
  // Uma empresa por vez: encerra o que estiver aberto.
  await db.from('support_access_sessions').update({ ended_at: now.toISOString() }).eq('user_id', realProfile.id).is('ended_at', null);
  const expiresAt = new Date(now.getTime() + SUPPORT_ACCESS_HOURS * 3600_000).toISOString();
  const { data, error } = await db
    .from('support_access_sessions')
    .insert({ user_id: realProfile.id, tenant_id: tenant.id, reason, expires_at: expiresAt })
    .select('id, started_at, expires_at')
    .single();
  if (error || !data) return { error: error?.message || 'Não foi possível entrar na empresa.', status: 500 };

  const actor = { id: realProfile.id, name: `${realProfile.name} (equipe Vórtice)` };
  await Promise.all([
    logAudit(actor, 'SUPPORT_ACCESS', `Entrou na empresa como administrador (modo suporte) por até ${SUPPORT_ACCESS_HOURS} h. Motivo: ${reason}`, 'support_access', data.id, db, tenant.id),
    logAudit({ id: realProfile.id, name: realProfile.name }, 'SUPPORT_ACCESS', `Entrou na empresa ${tenant.name} em modo suporte. Motivo: ${reason}`, 'support_access', data.id, db, String(realProfile.tenant_id)),
  ]);

  return {
    session_id: data.id,
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    reason,
    started_at: data.started_at,
    expires_at: data.expires_at,
    home_tenant_id: String(realProfile.tenant_id),
  };
}

export async function endSupportAccess(realProfile: UserProfile): Promise<{ ended: boolean }> {
  const { data } = await db
    .from('support_access_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('user_id', realProfile.id)
    .is('ended_at', null)
    .select('id, tenant_id');
  for (const row of data || []) {
    await logAudit({ id: realProfile.id, name: `${realProfile.name} (equipe Vórtice)` }, 'SUPPORT_ACCESS', 'Saiu da empresa (fim do modo suporte).', 'support_access', row.id, db, row.tenant_id);
  }
  return { ended: Boolean(data && data.length) };
}
