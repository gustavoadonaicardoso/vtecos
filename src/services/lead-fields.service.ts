/**
 * ============================================================
 * VTEC OS — Campos extras do lead (servidor)
 * ============================================================
 * - Campos personalizados da empresa (lead_custom_fields).
 * - Senha de acesso do lead (lead_secrets): só o servidor lê. Não vai
 *   na lista de leads; aparece quando alguém clica em "Mostrar" (fica
 *   na auditoria) e nas mensagens com {{senha_acesso}}.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import {
  ACCESS_PASSWORD_MAX,
  CUSTOM_FIELD_TYPES,
  MAX_CUSTOM_FIELDS,
  cleanCustomValue,
  customFieldKey,
  type CustomFieldDef,
  type CustomFieldType,
} from '@/lib/lead-fields';
import type { ServiceResult } from '@/types';

type Row = Record<string, unknown>;
const MIGRATION_HINT = 'Rode a migration 202611050001_lead_extra_fields.sql no Supabase para usar os campos extras dos leads.';
const missingTable = (message?: string) => Boolean(message && /lead_custom_fields|lead_secrets|custom_fields|access_|address_|birth_date|company_name|job_title|instagram|website|schema cache|does not exist/i.test(message));

// ── Campos personalizados ──────────────────────────────────────

export async function listCustomFields(tenantId: string): Promise<CustomFieldDef[]> {
  const { data, error } = await db.from('lead_custom_fields').select('key, label, type, position').eq('tenant_id', tenantId).order('position').order('created_at');
  if (error) return [];
  return ((data || []) as Row[]).map((row) => ({ key: String(row.key), label: String(row.label), type: row.type as CustomFieldType, position: Number(row.position) || 0 }));
}

/** Troca a lista inteira (a tela manda a lista na ordem). Valores dos campos removidos ficam guardados no lead. */
export async function saveCustomFields(tenantId: string, input: unknown): Promise<ServiceResult<CustomFieldDef[]>> {
  if (!Array.isArray(input)) return { success: false, error: 'Lista de campos inválida.' };
  if (input.length > MAX_CUSTOM_FIELDS) return { success: false, error: `No máximo ${MAX_CUSTOM_FIELDS} campos personalizados.` };
  const defs: CustomFieldDef[] = [];
  const types = CUSTOM_FIELD_TYPES.map((item) => item.value);
  for (const [index, item] of input.entries()) {
    const raw = (item || {}) as Row;
    const label = String(raw.label ?? '').trim().slice(0, 60);
    if (!label) return { success: false, error: `Dê um nome para o campo ${index + 1}.` };
    const key = customFieldKey(typeof raw.key === 'string' && raw.key ? raw.key : label);
    if (!key) return { success: false, error: `O nome "${label}" precisa ter letras ou números.` };
    if (defs.some((def) => def.key === key)) return { success: false, error: `Dois campos ficaram com a mesma variável ({{campo.${key}}}). Mude um dos nomes.` };
    const type = types.includes(raw.type as CustomFieldType) ? (raw.type as CustomFieldType) : 'text';
    defs.push({ key, label, type, position: index });
  }
  const { error: deleteError } = await db.from('lead_custom_fields').delete().eq('tenant_id', tenantId).not('key', 'in', `(${defs.map((def) => `"${def.key}"`).join(',') || '""'})`);
  if (deleteError) return { success: false, error: missingTable(deleteError.message) ? MIGRATION_HINT : deleteError.message };
  if (defs.length) {
    const { error } = await db.from('lead_custom_fields').upsert(defs.map((def) => ({ ...def, tenant_id: tenantId })), { onConflict: 'tenant_id,key' });
    if (error) return { success: false, error: missingTable(error.message) ? MIGRATION_HINT : error.message };
  }
  return { success: true, data: await listCustomFields(tenantId) };
}

/** Junta os valores novos com os que o lead já tem, validando pelo tipo de cada campo. */
export async function mergeCustomValues(tenantId: string, current: unknown, changes: unknown): Promise<{ value: Record<string, string> } | { error: string }> {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { error: 'Campos personalizados inválidos.' };
  const defs = await listCustomFields(tenantId);
  const merged: Record<string, string> = { ...((current && typeof current === 'object' ? current : {}) as Record<string, string>) };
  for (const [key, raw] of Object.entries(changes as Row)) {
    const def = defs.find((item) => item.key === key);
    if (!def) continue;
    const cleaned = cleanCustomValue(def, raw);
    if ('error' in cleaned) return { error: cleaned.error };
    if (cleaned.value === null) delete merged[key];
    else merged[key] = cleaned.value;
  }
  return { value: merged };
}

// ── Senha de acesso ────────────────────────────────────────────

export async function getAccessPassword(tenantId: string, leadId: string): Promise<string | null> {
  const { data } = await db.from('lead_secrets').select('access_password').eq('tenant_id', tenantId).eq('lead_id', leadId).maybeSingle();
  return (data?.access_password as string) || null;
}

/** Senhas de vários leads de uma vez (disparos). */
export async function getAccessPasswords(tenantId: string, leadIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!leadIds.length) return out;
  const { data } = await db.from('lead_secrets').select('lead_id, access_password').eq('tenant_id', tenantId).in('lead_id', leadIds);
  for (const row of (data || []) as Row[]) if (row.access_password) out.set(String(row.lead_id), String(row.access_password));
  return out;
}

export function cleanAccessPassword(raw: unknown): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined) return { value: null };
  const value = String(raw).trim();
  if (!value) return { value: null };
  if (value.length > ACCESS_PASSWORD_MAX) return { error: `A senha de acesso pode ter no máximo ${ACCESS_PASSWORD_MAX} caracteres.` };
  if (/[\r\n]/.test(value)) return { error: 'A senha de acesso não pode ter quebra de linha.' };
  return { value };
}

export async function setAccessPassword(tenantId: string, leadId: string, raw: unknown, actorId?: string | null): Promise<ServiceResult> {
  const cleaned = cleanAccessPassword(raw);
  if ('error' in cleaned) return { success: false, error: cleaned.error };
  // O lead precisa ser desta empresa (lead_secrets é indexada só pelo lead).
  const { data: lead } = await db.from('leads').select('id').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
  if (!lead) return { success: false, error: 'Lead não encontrado.' };
  if (cleaned.value === null) {
    const { error } = await db.from('lead_secrets').delete().eq('tenant_id', tenantId).eq('lead_id', leadId);
    if (error && !missingTable(error.message)) return { success: false, error: error.message };
    return { success: true };
  }
  const { error } = await db.from('lead_secrets').upsert(
    { lead_id: leadId, tenant_id: tenantId, access_password: cleaned.value, updated_at: new Date().toISOString(), updated_by: actorId || null },
    { onConflict: 'lead_id' },
  );
  if (error) return { success: false, error: missingTable(error.message) ? MIGRATION_HINT : error.message };
  return { success: true };
}

export { MIGRATION_HINT as LEAD_FIELDS_MIGRATION_HINT };

// ── Captura de leads (formulário/API): campos extras pelo nome ──

const PAYLOAD_NAMES: Record<string, string[]> = {
  accessEmail: ['access_email', 'accessEmail', 'email_acesso'],
  accessLogin: ['access_login', 'accessLogin', 'usuario_acesso', 'login'],
  accessUrl: ['access_url', 'accessUrl', 'link_acesso'],
  birthDate: ['birth_date', 'birthDate', 'data_nascimento', 'nascimento'],
  companyName: ['company_name', 'companyName', 'company', 'empresa'],
  jobTitle: ['job_title', 'jobTitle', 'cargo'],
  instagram: ['instagram'],
  website: ['website', 'site'],
  cep: ['cep', 'zip'],
  street: ['street', 'rua', 'logradouro', 'endereco'],
  number: ['number', 'numero'],
  complement: ['complement', 'complemento'],
  district: ['district', 'bairro'],
  city: ['city', 'cidade'],
  state: ['state', 'uf', 'estado'],
};

/**
 * Campos extras, personalizados e senha vindos de um formulário/API.
 * Valor inválido é ignorado (o lead entra mesmo assim) e volta em `ignored`.
 */
export async function extrasFromPayload(tenantId: string, body: Row): Promise<{ columns: Row; custom: Record<string, string>; password: string | null; ignored: string[] }> {
  const { EXTRA_FIELDS, cleanExtra } = await import('@/lib/lead-fields');
  const columns: Row = {};
  const ignored: string[] = [];
  for (const field of EXTRA_FIELDS) {
    const name = PAYLOAD_NAMES[field.key]?.find((item) => body[item] !== undefined && body[item] !== null && String(body[item]).trim() !== '');
    if (!name) continue;
    const cleaned = cleanExtra(field.key, body[name]);
    if ('error' in cleaned) ignored.push(name);
    else columns[field.column] = cleaned.value;
  }
  const custom: Record<string, string> = {};
  const defs = await listCustomFields(tenantId);
  if (defs.length) {
    const nested = body.campos && typeof body.campos === 'object' && !Array.isArray(body.campos) ? (body.campos as Row) : {};
    for (const def of defs) {
      const raw = nested[def.key] ?? body[`campo.${def.key}`] ?? body[`campo_${def.key}`];
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      const cleaned = cleanCustomValue(def, raw);
      if ('error' in cleaned) ignored.push(def.key);
      else if (cleaned.value !== null) custom[def.key] = cleaned.value;
    }
  }
  const rawPassword = body.access_password ?? body.accessPassword ?? body.senha_acesso;
  const password = cleanAccessPassword(rawPassword);
  if ('error' in password) ignored.push('senha_acesso');
  return { columns, custom, password: 'error' in password ? null : password.value, ignored };
}
