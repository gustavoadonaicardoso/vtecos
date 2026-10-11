/**
 * ============================================================
 * VTEC OS — Lembretes do teste grátis pelo WhatsApp da Vórtice
 * ============================================================
 * Quem se cadastra pelo teste grátis vira lead no CRM da Vórtice (etiqueta
 * "Teste grátis") e recebe mensagens no WhatsApp: boas-vindas, dica do
 * 3º dia, lembrete do 5º, fatura no 6º e obrigado quando paga. As
 * mensagens ficam na conversa do lead em Mensagens: a resposta do
 * cliente cai ali e a equipe continua o atendimento.
 *
 * Textos e liga/desliga: Painel Master > Plataforma (integrations_config
 * da empresa da plataforma, provider "trial_messages").
 * Andamento de cada empresa: integrations_config da empresa em teste,
 * provider "trial_nurture" ({ lead_id, phone, name, sent, errors,
 * finished_at }) -- separado da cobrança para um não sobrescrever o outro.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import {
  TRIAL_MESSAGE_DEFAULTS,
  TRIAL_MESSAGE_MAX,
  TRIAL_MESSAGE_ORDER,
  dueTrialStep,
  renderTrialMessage,
  type TrialMessageKey,
} from '@/lib/trial-messages';
import { stepsForModules } from '@/lib/onboarding';
import { brDate, cycleLabel, cyclePrice, notifyPlatform, todaySP } from '@/services/billing.service';

type Row = Record<string, unknown>;
const SETTINGS = 'trial_messages';
const STATE = 'trial_nurture';
const TZ = 'America/Sao_Paulo';
/** Horário comercial para mandar (boas-vindas: a qualquer hora, logo após o cadastro). */
const WINDOW = { start: 8, end: 20 };
const RETRY_MINUTES = 30;
const MAX_ATTEMPTS = 3;
const ALL_DONE_TIP = 'explorar as automações e os relatórios: é ali que o sistema começa a vender junto com você';

export interface TrialMessageSettings {
  enabled: boolean;
  texts: Record<TrialMessageKey, string>;
  /** Textos que a Vórtice mudou (os outros seguem o padrão). */
  custom: TrialMessageKey[];
}

interface NurtureState {
  lead_id?: string;
  phone?: string;
  name?: string;
  created_at?: string;
  sent?: Partial<Record<TrialMessageKey, string>>;
  errors?: Partial<Record<TrialMessageKey, { count: number; at: string; message: string }>>;
  finished_at?: string;
}

// ── Configuração (Painel Master) ───────────────────────────────

async function platformTenantId(): Promise<string | null> {
  // tenant-scope: ok (empresa dona da plataforma)
  const { data } = await db.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  return (data?.id as string) ?? null;
}

export async function trialMessageSettings(): Promise<TrialMessageSettings> {
  const platform = await platformTenantId();
  let stored: Row = {};
  if (platform) {
    const { data } = await db.from('integrations_config').select('config').eq('tenant_id', platform).eq('provider', SETTINGS).maybeSingle();
    stored = (data?.config as Row) || {};
  }
  const saved = (stored.texts as Partial<Record<TrialMessageKey, string>>) || {};
  const texts = { ...TRIAL_MESSAGE_DEFAULTS };
  const custom: TrialMessageKey[] = [];
  for (const key of TRIAL_MESSAGE_ORDER) {
    if (typeof saved[key] === 'string' && saved[key]!.trim()) {
      texts[key] = saved[key]!;
      custom.push(key);
    }
  }
  return { enabled: stored.enabled !== false, texts, custom };
}

export async function saveTrialMessageSettings(body: Row): Promise<{ ok: true; data: TrialMessageSettings } | { ok: false; error: string }> {
  const platform = await platformTenantId();
  if (!platform) return { ok: false, error: 'Empresa da plataforma não encontrada.' };
  const input = (body.texts as Row) || {};
  const texts: Partial<Record<TrialMessageKey, string>> = {};
  for (const key of TRIAL_MESSAGE_ORDER) {
    const value = typeof input[key] === 'string' ? String(input[key]).replace(/\r\n/g, '\n').trim() : '';
    if (value.length > TRIAL_MESSAGE_MAX) return { ok: false, error: `Mensagem muito longa (máximo ${TRIAL_MESSAGE_MAX} caracteres).` };
    // Igual ao padrão: não guarda (assim melhorias no texto padrão chegam sozinhas).
    if (value && value !== TRIAL_MESSAGE_DEFAULTS[key]) texts[key] = value;
  }
  const { error } = await db.from('integrations_config').upsert(
    { tenant_id: platform, provider: SETTINGS, config: { enabled: body.enabled !== false, texts }, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,provider' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: await trialMessageSettings() };
}

/** WhatsApp da Vórtice conectado? (mostra no Painel Master) */
export async function platformWhatsAppStatus(): Promise<{ web: boolean; api: boolean }> {
  const platform = await platformTenantId();
  if (!platform) return { web: false, api: false };
  const { availableChannels } = await import('@/lib/whatsapp-outbound');
  return availableChannels(platform).catch(() => ({ web: false, api: false }));
}

// ── Estado por empresa ─────────────────────────────────────────

async function saveState(tenantId: string, state: NurtureState) {
  await db.from('integrations_config').upsert(
    { tenant_id: tenantId, provider: STATE, config: state, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,provider' },
  );
}

// ── Cadastro: lead no CRM da Vórtice ───────────────────────────

export interface TrialLeadInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  cpfCnpj: string;
  planName: string;
  value: number;
  cycle: 'MONTHLY' | 'YEARLY';
  trialEndDate: string;
}

/**
 * Cria (ou atualiza, se o telefone já é lead) o lead no CRM da Vórtice e
 * guarda o andamento do teste. Nunca derruba o cadastro.
 */
export async function registerTrialLead(tenantId: string, input: TrialLeadInput): Promise<string | null> {
  try {
    const platform = await platformTenantId();
    if (!platform) return null;
    const { createLead, findLeadByPhone, registerTags } = await import('@/services/leads.service');
    const note = `Teste grátis: ${input.company} (${input.cpfCnpj}), plano ${input.planName} ${cycleLabel(input.cycle)}, até ${brDate(input.trialEndDate)}. E-mail: ${input.email}.`;
    const tags = ['Teste grátis', input.planName];
    let leadId: string | null = null;
    const existing = await findLeadByPhone(platform, input.phone);
    if (existing) {
      leadId = existing.id;
      const { data: row } = await db.from('leads').select('tags, notes').eq('tenant_id', platform).eq('id', leadId).maybeSingle();
      const merged = [...new Set([...((row?.tags as string[]) || []), ...tags])];
      const notes = [row?.notes, note].filter(Boolean).join('\n\n').slice(0, 4000);
      await db.from('leads').update({ tags: merged, notes, email: input.email, value: input.value }).eq('tenant_id', platform).eq('id', leadId);
      await registerTags(platform, merged);
    } else {
      const created = await createLead(platform, { name: input.name, phone: input.phone, email: input.email, cpfCnpj: input.cpfCnpj, tags, notes: note });
      if (!created.success || !created.data) {
        console.error('[teste-gratis] lead não criado:', created.error);
      } else {
        leadId = String(created.data.id);
        await db.from('leads').update({ source: 'Teste grátis', value: input.value }).eq('tenant_id', platform).eq('id', leadId);
      }
    }
    await saveState(tenantId, { lead_id: leadId || undefined, phone: input.phone.replace(/\D/g, ''), name: input.name, created_at: new Date().toISOString(), sent: {}, errors: {} });
    return leadId;
  } catch (error) {
    console.error('[teste-gratis] falha ao registrar o lead:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ── Envio (rotina da cobrança, a cada 5 min) ───────────────────

const hourSP = (now: Date) => Number(now.toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })) % 24;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
const appLink = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://app.vorticetecnologia.com.br').replace(/\/$/, '');
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function nextStepTip(tenantId: string, modules: string[] | null) {
  const { onboardingProgress } = await import('@/services/onboarding.service');
  const progress = await onboardingProgress(tenantId, modules).catch(() => null);
  const pending = progress?.steps.find((step) => !step.done);
  return pending ? pending.tip : progress ? ALL_DONE_TIP : stepsForModules(modules)[0]?.tip || ALL_DONE_TIP;
}

type Sender = (platformId: string, leadId: string | null, phone: string, text: string) => Promise<void>;

const defaultSender: Sender = async (platformId, leadId, phone, text) => {
  const { sendToLead, deliverWhatsApp } = await import('@/lib/whatsapp-outbound');
  if (leadId) {
    const { data } = await db.from('leads').select('id').eq('tenant_id', platformId).eq('id', leadId).maybeSingle();
    if (data) return sendToLead(platformId, leadId, phone, { text }, 'automation');
  }
  // Lead apagado do CRM: manda mesmo assim, sem registrar conversa.
  await deliverWhatsApp(platformId, phone, { text });
};

export interface TrialRunResult {
  sent: { tenantId: string; key: TrialMessageKey }[];
  failed: { tenantId: string; key: TrialMessageKey; error: string }[];
}

/** Uma passada: no máximo uma mensagem por empresa. */
export async function runTrialMessages(now = new Date(), deps: { send?: Sender } = {}): Promise<TrialRunResult> {
  const result: TrialRunResult = { sent: [], failed: [] };
  const settings = await trialMessageSettings();
  if (!settings.enabled) return result;
  const platform = await platformTenantId();
  if (!platform) return result;
  const send = deps.send || defaultSender;

  // tenant-scope: ok (rotina da plataforma: percorre os testes de todas as empresas)
  const { data: rows } = await db.from('integrations_config').select('tenant_id, config').eq('provider', STATE).is('config->>finished_at', null).limit(200);
  const today = todaySP(now);
  const hour = hourSP(now);

  for (const row of (rows || []) as Row[]) {
    const tenantId = String(row.tenant_id);
    const state = { sent: {}, errors: {}, ...((row.config as NurtureState) || {}) } as NurtureState & { sent: NonNullable<NurtureState['sent']>; errors: NonNullable<NurtureState['errors']> };
    if (!state.phone) continue;
    const { data: tenant } = await db
      .from('tenants')
      .select('id, name, plan_id, billing_status, billing_cycle, trial_ends_at, billing_invoice_url')
      .eq('id', tenantId)
      .maybeSingle();
    if (!tenant) {
      await saveState(tenantId, { ...state, finished_at: now.toISOString() });
      continue;
    }

    let key: TrialMessageKey | null = null;
    let skip: TrialMessageKey[] = [];
    if (tenant.billing_status === 'trial' && tenant.trial_ends_at) {
      const endsOn = todaySP(new Date(String(tenant.trial_ends_at)));
      ({ send: key, skip } = dueTrialStep(daysBetween(today, endsOn), state.sent));
    } else if (tenant.billing_status === 'active' && !state.sent.paid) {
      key = 'paid';
    } else if (tenant.billing_status === 'past_due') {
      // Teste acabou e a fatura está nos dias de tolerância: se pagar, ainda manda o obrigado.
      continue;
    } else {
      // Suspensa, cancelada ou cobrança desligada: a cobrança segue pelos avisos do sistema.
      await saveState(tenantId, { ...state, finished_at: now.toISOString() });
      continue;
    }
    if (!key) continue;

    const justSignedUp = key === 'welcome' && state.created_at && now.getTime() - Date.parse(state.created_at) < 2 * 3_600_000;
    if (!justSignedUp && (hour < WINDOW.start || hour >= WINDOW.end)) continue;
    const lastError = state.errors[key];
    if (lastError && now.getTime() - Date.parse(lastError.at) < RETRY_MINUTES * 60_000) continue;

    const { data: plan } = tenant.plan_id ? await db.from('plans').select('name, price, modules').eq('id', String(tenant.plan_id)).maybeSingle() : { data: null };
    const cycle = tenant.billing_cycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
    const endsOn = tenant.trial_ends_at ? todaySP(new Date(String(tenant.trial_ends_at))) : today;
    const vars: Record<string, string> = {
      nome: String(state.name || '').trim().split(/\s+/)[0] || 'tudo bem',
      empresa: String(tenant.name || ''),
      plano: String(plan?.name || ''),
      valor: plan ? money(cyclePrice(Number(plan.price) || 0, cycle)) : '',
      ciclo: cycleLabel(cycle),
      fim: brDate(endsOn),
      dias: String(Math.max(0, daysBetween(today, endsOn))),
      fatura: String(tenant.billing_invoice_url || `${appLink()}/settings?tab=plan`),
      proximo_passo: await nextStepTip(tenantId, Array.isArray(plan?.modules) ? (plan!.modules as string[]) : null),
      link: appLink(),
    };
    const text = renderTrialMessage(settings.texts[key], vars);

    for (const skipped of skip) state.sent[skipped] = `skipped:${now.toISOString()}`;
    try {
      await send(platform, state.lead_id || null, state.phone, text);
      state.sent[key] = now.toISOString();
      delete state.errors[key];
      if (key === 'paid') state.finished_at = now.toISOString();
      result.sent.push({ tenantId, key });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const count = (lastError?.count || 0) + 1;
      if (count >= MAX_ATTEMPTS) {
        state.sent[key] = `failed:${now.toISOString()}`;
        delete state.errors[key];
        await notifyPlatform('Lembrete do teste grátis não enviado', `${tenant.name}: a mensagem "${key}" não saiu pelo WhatsApp da Vórtice (${message.slice(0, 160)}). Confira a conexão em Integrações.`).catch(() => {});
      } else {
        state.errors[key] = { count, at: now.toISOString(), message: message.slice(0, 300) };
      }
      result.failed.push({ tenantId, key, error: message });
    }
    await saveState(tenantId, state);
  }
  return result;
}
