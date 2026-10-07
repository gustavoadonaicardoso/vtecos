/**
 * ============================================================
 * VTEC OS — Discador automático: campanhas e atendentes (server-only)
 * ============================================================
 * Campanhas (planilha → fila de números) são de administradores e
 * gerentes. Qualquer pessoa com acesso ao Discador pode ser atendente:
 * fica disponível, recebe as ligações atendidas e marca o resultado.
 * O motor que liga está em src/lib/dialer/engine.ts.
 * ============================================================
 */

import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { twilioConfigFor, type TwilioConfig } from '@/lib/twilio-tenant';
import { AGENT_STALE_MS } from '@/lib/dialer/engine';
import { toE164 } from '@/lib/dialer/phone';
import {
  OUTCOMES,
  RETRYABLE,
  type AgentState,
  type AgentStatus,
  type CampaignStatus,
  type ContactStatus,
  type DialerCampaign,
  type DialerContact,
  type StatusCounts,
  type TeamAgent,
} from '@/lib/dialer/types';

type Row = Record<string, unknown>;
type Failure = { error: string };
type Viewer = { id: string; role: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTACTS = 5000;
const PAGE_SIZE = 50;
const CONTACT_STATUSES: ContactStatus[] = ['pending', 'dialing', 'connected', 'completed', 'no_answer', 'busy', 'voicemail', 'abandoned', 'failed'];
const nowIso = () => new Date().toISOString();
const freshCutoff = () => new Date(Date.now() - AGENT_STALE_MS).toISOString();

export const isDialerManager = (role: string) => role === 'ADMIN' || role === 'MANAGER';

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

function toCampaign(row: Row, counts: StatusCounts): DialerCampaign {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    status: row.status as CampaignStatus,
    callsPerAgent: Number(row.calls_per_agent) || 1,
    detectVoicemail: row.detect_voicemail !== false,
    ringSeconds: Number(row.ring_seconds) || 25,
    createdAt: String(row.created_at),
    startedAt: (row.started_at as string) || null,
    finishedAt: (row.finished_at as string) || null,
    lastError: (row.last_error as string) || null,
    counts,
    total: Object.values(counts).reduce((sum, value) => sum + (value || 0), 0),
  };
}

function toContact(row: Row, names: Map<string, string>): DialerContact {
  return {
    id: String(row.id),
    name: (row.name as string) || null,
    phone: String(row.phone),
    data: (row.data && typeof row.data === 'object' ? row.data : {}) as Record<string, string>,
    status: row.status as ContactStatus,
    attempts: Number(row.attempts) || 0,
    agentName: row.agent_id ? names.get(String(row.agent_id)) || null : null,
    answeredBy: (row.answered_by as string) || null,
    outcome: (row.outcome as string) || null,
    notes: (row.notes as string) || null,
    duration: row.duration == null ? null : Number(row.duration),
    talkSeconds: row.talk_seconds == null ? null : Number(row.talk_seconds),
    hasRecording: Boolean(row.recording_url),
    error: (row.error as string) || null,
    dialedAt: (row.dialed_at as string) || null,
    endedAt: (row.ended_at as string) || null,
  };
}

async function countsFor(tenantId: string, campaignId?: string): Promise<Map<string, StatusCounts>> {
  const { data, error } = await db.rpc('dialer_campaign_counts', { p_tenant: tenantId, p_campaign: campaignId ?? null });
  if (error) throw new Error(error.message);
  const map = new Map<string, StatusCounts>();
  for (const row of (data || []) as { campaign_id: string; status: ContactStatus; total: number }[]) {
    const counts = map.get(row.campaign_id) || {};
    counts[row.status] = Number(row.total);
    map.set(row.campaign_id, counts);
  }
  return map;
}

async function profileNames(tenantId: string, ids: unknown[]) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await db.from('profiles').select('id, name').eq('tenant_id', tenantId).in('id', unique);
  return new Map((data || []).map((row) => [String(row.id), String(row.name || 'Atendente')]));
}

// ── Campanhas ───────────────────────────────────────────────

export async function listCampaigns(tenantId: string): Promise<DialerCampaign[]> {
  const { data, error } = await db.from('dialer_campaigns').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  const counts = await countsFor(tenantId);
  return ((data || []) as Row[]).map((row) => toCampaign(row, counts.get(String(row.id)) || {}));
}

/** Cria a campanha com os números da planilha (inválidos e repetidos ficam de fora). */
export async function createCampaign(tenantId: string, actor: Viewer, input: Row): Promise<{ campaign: DialerCampaign; imported: number; invalid: number; duplicates: number } | Failure> {
  const name = String(input.name || '').trim().slice(0, 120);
  if (name.length < 2) return { error: 'Dê um nome para a campanha.' };
  const rows = Array.isArray(input.contacts) ? (input.contacts as Row[]) : [];
  if (rows.length === 0) return { error: 'A planilha não tem contatos.' };
  if (rows.length > MAX_CONTACTS) return { error: `Uma campanha aceita até ${MAX_CONTACTS} contatos. Divida a planilha.` };

  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  const contacts: { name: string | null; phone: string; data: Record<string, string> }[] = [];
  for (const row of rows) {
    const phone = toE164(row?.phone);
    if (!phone) { invalid += 1; continue; }
    if (seen.has(phone)) { duplicates += 1; continue; }
    seen.add(phone);
    const data: Record<string, string> = {};
    if (row.data && typeof row.data === 'object') {
      for (const [key, value] of Object.entries(row.data as Row).slice(0, 12)) {
        const text = String(value ?? '').trim();
        if (key.trim() && text) data[key.trim().slice(0, 40)] = text.slice(0, 200);
      }
    }
    contacts.push({ name: String(row.name || '').trim().slice(0, 120) || null, phone, data });
  }
  if (contacts.length === 0) return { error: 'Nenhum telefone válido na planilha. Use DDD + número (ex.: 11 99999-8888).' };

  const { data: created, error } = await db
    .from('dialer_campaigns')
    .insert({
      tenant_id: tenantId,
      name,
      calls_per_agent: clampInt(input.callsPerAgent, 1, 3, 1),
      detect_voicemail: input.detectVoicemail !== false,
      ring_seconds: clampInt(input.ringSeconds, 10, 60, 25),
      created_by: actor.id,
    })
    .select('*')
    .single();
  if (error || !created) return { error: error?.message || 'Não foi possível criar a campanha.' };

  for (let start = 0; start < contacts.length; start += 500) {
    const chunk = contacts.slice(start, start + 500).map((contact, index) => ({ ...contact, tenant_id: tenantId, campaign_id: created.id, position: start + index }));
    // tenant-scope: ok (cada linha do lote leva o tenant_id)
    const { error: insertError } = await db.from('dialer_contacts').insert(chunk);
    if (insertError) {
      await db.from('dialer_campaigns').delete().eq('tenant_id', tenantId).eq('id', created.id);
      return { error: insertError.message };
    }
  }
  return { campaign: toCampaign(created as Row, { pending: contacts.length }), imported: contacts.length, invalid, duplicates };
}

export async function getCampaign(tenantId: string, id: string, filters: { status?: string | null; page?: number }): Promise<{ campaign: DialerCampaign; contacts: DialerContact[]; filtered: number; page: number; pageSize: number } | Failure> {
  if (!UUID.test(id)) return { error: 'Campanha não encontrada.' };
  const { data: row } = await db.from('dialer_campaigns').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!row) return { error: 'Campanha não encontrada.' };
  const counts = (await countsFor(tenantId, id)).get(id) || {};
  const page = Math.max(0, Math.floor(Number(filters.page) || 0));

  let query = db.from('dialer_contacts').select('*', { count: 'exact' }).eq('tenant_id', tenantId).eq('campaign_id', id);
  if (filters.status === 'retry') query = query.in('status', RETRYABLE);
  else if (filters.status && CONTACT_STATUSES.includes(filters.status as ContactStatus)) query = query.eq('status', filters.status);
  const { data, count, error } = await query.order('position').range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (error) return { error: error.message };
  const names = await profileNames(tenantId, (data || []).map((item) => item.agent_id));
  return { campaign: toCampaign(row as Row, counts), contacts: ((data || []) as Row[]).map((item) => toContact(item, names)), filtered: count || 0, page, pageSize: PAGE_SIZE };
}

/** Exporta todos os contatos (resultado, atendente, anotação) para planilha. */
export async function exportCampaign(tenantId: string, id: string): Promise<DialerContact[] | Failure> {
  if (!UUID.test(id)) return { error: 'Campanha não encontrada.' };
  const { data, error } = await db.from('dialer_contacts').select('*').eq('tenant_id', tenantId).eq('campaign_id', id).order('position').limit(MAX_CONTACTS);
  if (error) return { error: error.message };
  const names = await profileNames(tenantId, (data || []).map((item) => item.agent_id));
  return ((data || []) as Row[]).map((item) => toContact(item, names));
}

export async function campaignAction(tenantId: string, id: string, body: Row): Promise<{ ok: true; requeued?: number } | Failure> {
  if (!UUID.test(id)) return { error: 'Campanha não encontrada.' };
  const { data: row } = await db.from('dialer_campaigns').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!row) return { error: 'Campanha não encontrada.' };
  const now = nowIso();
  const update = (fields: Row) => db.from('dialer_campaigns').update({ ...fields, updated_at: now }).eq('tenant_id', tenantId).eq('id', id);

  switch (body.action) {
    case 'start': {
      if (!(await twilioConfigFor(tenantId))) return { error: 'Conecte a conta Twilio da empresa em Integrações > Discador antes de começar.' };
      const { count } = await db.from('dialer_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('campaign_id', id).eq('status', 'pending');
      if (!count) return { error: 'Não há contatos na fila. Use "Ligar de novo" para devolver os que não atenderam.' };
      const { error } = await update({ status: 'running', started_at: row.started_at || now, finished_at: null, last_error: null });
      return error ? { error: error.message } : { ok: true };
    }
    case 'pause': {
      if (row.status !== 'running') return { error: 'A campanha não está ligando.' };
      const { error } = await update({ status: 'paused' });
      return error ? { error: error.message } : { ok: true };
    }
    case 'finish': {
      const { error } = await update({ status: 'finished', finished_at: now });
      return error ? { error: error.message } : { ok: true };
    }
    case 'requeue': {
      const requested = Array.isArray(body.statuses) ? (body.statuses as string[]).filter((status): status is ContactStatus => RETRYABLE.includes(status as ContactStatus)) : RETRYABLE;
      if (requested.length === 0) return { error: 'Escolha quais contatos voltam para a fila.' };
      const { data, error } = await db.from('dialer_contacts').update({ status: 'pending', updated_at: now }).eq('tenant_id', tenantId).eq('campaign_id', id).in('status', requested).select('id');
      if (error) return { error: error.message };
      if (row.status === 'finished' && data?.length) await update({ status: 'paused', finished_at: null });
      return { ok: true, requeued: data?.length || 0 };
    }
    case 'settings': {
      const name = String(body.name ?? row.name).trim().slice(0, 120);
      if (name.length < 2) return { error: 'Dê um nome para a campanha.' };
      const { error } = await update({
        name,
        calls_per_agent: clampInt(body.callsPerAgent ?? row.calls_per_agent, 1, 3, 1),
        detect_voicemail: body.detectVoicemail === undefined ? row.detect_voicemail : body.detectVoicemail !== false,
        ring_seconds: clampInt(body.ringSeconds ?? row.ring_seconds, 10, 60, 25),
      });
      return error ? { error: error.message } : { ok: true };
    }
    default:
      return { error: 'Ação desconhecida.' };
  }
}

export async function deleteCampaign(tenantId: string, id: string): Promise<{ ok: true } | Failure> {
  if (!UUID.test(id)) return { error: 'Campanha não encontrada.' };
  const { data: row } = await db.from('dialer_campaigns').select('status').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!row) return { error: 'Campanha não encontrada.' };
  if (row.status === 'running') return { error: 'Pause a campanha antes de apagar.' };
  const { count } = await db.from('dialer_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('campaign_id', id).in('status', ['dialing', 'connected']);
  if (count) return { error: 'Ainda há ligações em andamento nesta campanha.' };
  const { error } = await db.from('dialer_campaigns').delete().eq('tenant_id', tenantId).eq('id', id);
  return error ? { error: error.message } : { ok: true };
}

// ── Atendente ───────────────────────────────────────────────

async function agentRow(tenantId: string, profileId: string): Promise<Row> {
  // tenant-scope: ok (a linha é da pessoa; a empresa é conferida logo abaixo)
  const { data } = await db.from('dialer_agents').select('*').eq('profile_id', profileId).maybeSingle();
  if (!data) {
    const fresh = { profile_id: profileId, tenant_id: tenantId, status: 'offline', last_seen: nowIso(), status_since: nowIso() };
    // tenant-scope: ok (fresh leva o tenant_id)
    await db.from('dialer_agents').insert(fresh);
    return fresh;
  }
  // Mudou de empresa (modo suporte): começa offline na empresa atual.
  if (data.tenant_id !== tenantId && data.status !== 'on_call') {
    const moved = { tenant_id: tenantId, status: 'offline', contact_id: null, status_since: nowIso() };
    // tenant-scope: ok (a linha é da pessoa, que agora está em outra empresa)
    await db.from('dialer_agents').update(moved).eq('profile_id', profileId);
    return { ...data, ...moved };
  }
  return data as Row;
}

export async function agentState(tenantId: string, profileId: string, heartbeat = false): Promise<AgentState> {
  let row = await agentRow(tenantId, profileId);
  const stale = new Date(String(row.last_seen)).getTime() < Date.now() - AGENT_STALE_MS;
  if (heartbeat) {
    const fields: Row = { last_seen: nowIso() };
    // Voltou depois de sumir: não fica "disponível" sem querer.
    if (stale && ['available', 'wrapup'].includes(String(row.status))) Object.assign(fields, { status: 'offline', contact_id: null, status_since: nowIso() });
    await db.from('dialer_agents').update(fields).eq('tenant_id', tenantId).eq('profile_id', profileId);
    row = { ...row, ...fields };
  }

  const config = await twilioConfigFor(tenantId);
  let contact: AgentState['contact'] = null;
  if (row.contact_id) {
    const { data } = await db.from('dialer_contacts').select('*').eq('tenant_id', tenantId).eq('id', String(row.contact_id)).maybeSingle();
    if (data) {
      const { data: campaign } = await db.from('dialer_campaigns').select('name').eq('tenant_id', tenantId).eq('id', String(data.campaign_id)).maybeSingle();
      contact = { ...toContact(data as Row, new Map()), campaignName: String(campaign?.name || '') };
    }
  }

  const { data: running } = await db.from('dialer_campaigns').select('id, name').eq('tenant_id', tenantId).eq('status', 'running').order('started_at');
  const counts = running && running.length ? await countsFor(tenantId) : new Map<string, StatusCounts>();
  return {
    status: row.status as AgentStatus,
    since: String(row.status_since),
    connected: Boolean(config),
    phoneNumber: config?.phoneNumber || null,
    contact,
    running: (running || []).map((campaign) => ({ id: String(campaign.id), name: String(campaign.name), pending: counts.get(String(campaign.id))?.pending || 0 })),
  };
}

export async function agentAction(tenantId: string, profileId: string, body: Row): Promise<AgentState | Failure> {
  const row = await agentRow(tenantId, profileId);
  const now = nowIso();
  const action = String(body.action || '');
  const setStatus = async (status: AgentStatus, extra: Row = {}) => {
    const { error } = await db.from('dialer_agents').update({ status, status_since: now, last_seen: now, contact_id: null, ...extra }).eq('tenant_id', tenantId).eq('profile_id', profileId);
    return error ? { error: error.message } : null;
  };

  if (action === 'heartbeat') return agentState(tenantId, profileId, true);
  if (row.status === 'on_call' && action !== 'offline') return { error: 'Termine a ligação atual primeiro.' };

  if (action === 'available') {
    if (!(await twilioConfigFor(tenantId))) return { error: 'O Discador não está conectado. Um administrador conecta a conta Twilio em Integrações.' };
    const failed = await setStatus('available');
    if (failed) return failed;
  } else if (action === 'pause') {
    const failed = await setStatus('paused');
    if (failed) return failed;
  } else if (action === 'offline') {
    // Saiu da tela no meio de uma ligação: a ligação segue, o motor só não passa outras.
    const failed = row.status === 'on_call' ? null : await setStatus('offline');
    if (failed) return failed;
  } else if (action === 'wrapup') {
    if (!row.contact_id) return { error: 'Nenhuma ligação para finalizar.' };
    const outcome = OUTCOMES.some((item) => item.key === body.outcome) ? String(body.outcome) : null;
    const notes = String(body.notes || '').trim().slice(0, 1000) || null;
    await db.from('dialer_contacts').update({ outcome, notes, updated_at: now }).eq('tenant_id', tenantId).eq('id', String(row.contact_id)).eq('agent_id', profileId);
    const failed = await setStatus(body.next === 'pause' ? 'paused' : 'available');
    if (failed) return failed;
  } else {
    return { error: 'Ação desconhecida.' };
  }
  return agentState(tenantId, profileId);
}

/** Quem está com o discador aberto agora. */
export async function teamAgents(tenantId: string): Promise<TeamAgent[]> {
  const { data } = await db.from('dialer_agents').select('*').eq('tenant_id', tenantId).neq('status', 'offline');
  const rows = ((data || []) as Row[]).filter((row) => row.status === 'on_call' || String(row.last_seen) >= freshCutoff());
  const names = await profileNames(tenantId, rows.map((row) => row.profile_id));
  const contactIds = rows.map((row) => row.contact_id).filter(Boolean).map(String);
  const { data: contacts } = contactIds.length ? await db.from('dialer_contacts').select('id, name, phone').eq('tenant_id', tenantId).in('id', contactIds) : { data: [] };
  const contactName = new Map((contacts || []).map((item) => [String(item.id), String(item.name || item.phone)]));
  return rows
    .map((row) => ({
      profileId: String(row.profile_id),
      name: names.get(String(row.profile_id)) || 'Atendente',
      status: row.status as AgentStatus,
      since: String(row.status_since),
      contactName: row.contact_id ? contactName.get(String(row.contact_id)) || null : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// ── Histórico e gravações ───────────────────────────────────

export async function callHistory(tenantId: string, profileId: string) {
  const { data, error } = await db.from('call_logs').select('id, contact_number, direction, status, duration, recording_url, created_at').eq('tenant_id', tenantId).eq('user_id', profileId).order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    contactNumber: String(row.contact_number || ''),
    direction: String(row.direction || 'outbound'),
    status: String(row.status || ''),
    duration: row.duration == null ? null : Number(row.duration),
    hasRecording: Boolean(row.recording_url),
    createdAt: String(row.created_at),
  }));
}

/** Endereço da gravação + conta da empresa (para baixar com a senha dela). */
export async function recordingFor(tenantId: string, viewer: Viewer, ref: { contactId?: string | null; logId?: string | null }): Promise<{ url: string; config: TwilioConfig; fileName: string } | Failure> {
  let url = '';
  let owner = '';
  let fileName = 'gravacao';
  if (ref.contactId && UUID.test(ref.contactId)) {
    const { data } = await db.from('dialer_contacts').select('recording_url, agent_id, phone').eq('tenant_id', tenantId).eq('id', ref.contactId).maybeSingle();
    url = String(data?.recording_url || '');
    owner = String(data?.agent_id || '');
    fileName = `ligacao-${String(data?.phone || '').replace(/\D/g, '')}`;
  } else if (ref.logId && UUID.test(ref.logId)) {
    const { data } = await db.from('call_logs').select('recording_url, user_id, contact_number, created_at').eq('tenant_id', tenantId).eq('id', ref.logId).maybeSingle();
    url = String(data?.recording_url || '');
    owner = String(data?.user_id || '');
    fileName = `ligacao-${String(data?.contact_number || '').replace(/\D/g, '')}-${String(data?.created_at || '').slice(0, 10)}`;
  }
  if (!url) return { error: 'Gravação não encontrada.' };
  if (!isDialerManager(viewer.role) && owner !== viewer.id) return { error: 'Você só pode ouvir as suas ligações.' };
  if (!/^https:\/\/api\.twilio\.com\//.test(url)) return { error: 'Endereço de gravação inválido.' };
  const config = await twilioConfigFor(tenantId);
  if (!config) return { error: 'O Discador não está conectado.' };
  return { url: /\.(mp3|wav)$/.test(url) ? url : `${url}.mp3`, config, fileName };
}
