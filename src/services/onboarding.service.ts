/**
 * ============================================================
 * VTEC OS — Primeiros passos (checklist do Início)
 * ============================================================
 * Confere o que a empresa já fez (WhatsApp conectado, equipe, leads,
 * funil, respostas rápidas). Passo concluído fica concluído, mesmo que
 * depois o WhatsApp desconecte. Guardado em integrations_config da
 * própria empresa (provider "onboarding"): { done: {passo: data},
 * dismissed_at }.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { stepsForModules, type OnboardingKey, type OnboardingView } from '@/lib/onboarding';
import { DEFAULT_STAGES } from '@/services/pipeline.service';

type Row = Record<string, unknown>;
const PROVIDER = 'onboarding';
/** Empresas criadas há mais tempo que isso não veem o checklist (já usam o sistema). */
const SHOW_FOR_DAYS = 45;

interface Stored {
  done?: Partial<Record<OnboardingKey, string>>;
  dismissed_at?: string;
}

async function loadStored(tenantId: string): Promise<Stored> {
  const { data } = await db.from('integrations_config').select('config').eq('tenant_id', tenantId).eq('provider', PROVIDER).maybeSingle();
  return ((data?.config as Stored) || {});
}

async function saveStored(tenantId: string, stored: Stored) {
  await db.from('integrations_config').upsert(
    { tenant_id: tenantId, provider: PROVIDER, config: stored, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,provider' },
  );
}

const count = async (table: string, tenantId: string, extra?: (query: ReturnType<typeof base>) => ReturnType<typeof base>) => {
  let query = base(table, tenantId);
  if (extra) query = extra(query);
  const { count: total } = await query;
  return total || 0;
};
const base = (table: string, tenantId: string) => db.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);

async function whatsappConnected(tenantId: string) {
  try {
    const { availableChannels } = await import('@/lib/whatsapp-outbound');
    const channels = await availableChannels(tenantId);
    return channels.web || channels.api;
  } catch {
    return false;
  }
}

async function pipelineCustomized(tenantId: string) {
  const { data: stages } = await db.from('pipeline_stages').select('id, name, position').eq('tenant_id', tenantId).order('position');
  const list = (stages || []) as Row[];
  if (!list.length) return false;
  const sameAsDefault = list.length === DEFAULT_STAGES.length && list.every((stage, index) => stage.id === DEFAULT_STAGES[index].id && stage.name === DEFAULT_STAGES[index].name);
  if (!sameAsDefault) return true;
  // Funil padrão: conta quando algum lead já saiu da primeira etapa.
  const { count: moved } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('stage_id', 'is', null).neq('stage_id', String(list[0].id));
  return (moved || 0) > 0;
}

const CHECKS: Record<OnboardingKey, (tenantId: string) => Promise<boolean>> = {
  whatsapp: whatsappConnected,
  team: async (tenantId) => (await count('profiles', tenantId)) >= 2,
  leads: async (tenantId) => (await count('leads', tenantId)) >= 1,
  pipeline: pipelineCustomized,
  quick_replies: async (tenantId) => (await count('message_templates', tenantId, (query) => query.eq('is_active', true))) >= 1,
};

/** Situação dos primeiros passos (sem decidir se mostra ou não). */
export async function onboardingProgress(tenantId: string, modules: string[] | null): Promise<OnboardingView> {
  const stored = await loadStored(tenantId);
  const done = { ...(stored.done || {}) };
  const steps = stepsForModules(modules);
  let changed = false;
  const results = await Promise.all(steps.map(async (step) => {
    if (done[step.key]) return true;
    const ok = await CHECKS[step.key](tenantId).catch(() => false);
    if (ok) {
      done[step.key] = new Date().toISOString();
      changed = true;
    }
    return ok;
  }));
  if (changed) await saveStored(tenantId, { ...stored, done });
  const view = steps.map((step, index) => ({ ...step, done: results[index] }));
  const finished = view.filter((step) => step.done).length;
  return { steps: view, done: finished, total: view.length, allDone: finished === view.length };
}

/** Checklist do Início: só para empresas novas (ou em teste) que não fecharam o quadro. */
export async function onboardingForHome(tenantId: string, modules: string[] | null, now = new Date()): Promise<OnboardingView | null> {
  const { data: tenant } = await db.from('tenants').select('created_at, is_platform, billing_status').eq('id', tenantId).maybeSingle();
  if (!tenant || tenant.is_platform) return null;
  const createdAt = tenant.created_at ? Date.parse(String(tenant.created_at)) : now.getTime();
  const recent = now.getTime() - createdAt <= SHOW_FOR_DAYS * 86_400_000;
  if (!recent && tenant.billing_status !== 'trial') return null;
  const stored = await loadStored(tenantId);
  if (stored.dismissed_at) return null;
  const view = await onboardingProgress(tenantId, modules);
  return view.total >= 2 ? view : null;
}

export async function dismissOnboarding(tenantId: string) {
  const stored = await loadStored(tenantId);
  await saveStored(tenantId, { ...stored, dismissed_at: new Date().toISOString() });
}
