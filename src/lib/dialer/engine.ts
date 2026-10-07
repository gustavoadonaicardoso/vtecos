/**
 * ============================================================
 * VTEC OS — Discador automático: motor (server-only)
 * ============================================================
 * Como funciona:
 *   1. O atendente abre o Discador e fica "Disponível" (o navegador
 *      registra o telefone virtual e avisa o servidor a cada 5 s).
 *   2. A cada 3 s o motor conta os atendentes livres de cada empresa e
 *      liga para o próximo contato da campanha (até N ligações por
 *      atendente livre), pela conta Twilio da empresa.
 *   3. Quando alguém atende, a Twilio pergunta o que fazer (answer):
 *      caixa postal → desliga; pessoa → reserva um atendente livre e
 *      passa a ligação para o navegador dele, gravando; ninguém livre →
 *      mensagem educada e desliga ("sem atendente livre").
 *   4. Fim da conversa (bridge) → o atendente marca o resultado e volta
 *      a ficar disponível.
 * Cada aviso da Twilio é conferido pela assinatura da conta da empresa
 * (verifyTwilioRequest) e só mexe em contatos dessa empresa.
 * ============================================================
 */

import twilio from 'twilio';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { beat } from '@/lib/heartbeat';
import { publicUrl, twilioConfigFor, type TwilioConfig } from '@/lib/twilio-tenant';
import { twilioIdentity } from '@/services/twilio.service';

type Row = Record<string, unknown>;

/** Atendente sem dar sinal por mais que isso está offline. */
export const AGENT_STALE_MS = 45_000;
/** Ligação "chamando" sem nenhum aviso da Twilio por mais que isso falhou. */
const DIALING_STUCK_MS = 3 * 60_000;
/** Ligações novas por empresa a cada ciclo (protege a conta de rajadas). */
const MAX_NEW_CALLS_PER_TICK = 10;
const TICK_MS = 3_000;
/** Tempo para o navegador do atendente aceitar a ligação. */
const AGENT_RING_SECONDS = 15;

const nowIso = () => new Date().toISOString();
const freshCutoff = () => new Date(Date.now() - AGENT_STALE_MS).toISOString();
const log = (message: string, error?: unknown) => console.error(`[discador] ${message}`, error ?? '');

function twiml(build: (response: InstanceType<typeof twilio.twiml.VoiceResponse>) => void) {
  const response = new twilio.twiml.VoiceResponse();
  build(response);
  return response.toString();
}

const say = (response: InstanceType<typeof twilio.twiml.VoiceResponse>, text: string) =>
  response.say({ language: 'pt-BR', voice: 'Polly.Camila' }, text);

export const HANGUP = () => twiml((response) => response.hangup());
const SORRY = 'Olá! No momento todos os nossos atendentes estão ocupados. Vamos retornar sua ligação em breve. Obrigado!';

function friendlyTwilioError(error: unknown) {
  const code = (error as { code?: number })?.code;
  if (code === 20003) return 'A Twilio recusou a conta. Reconecte o Discador em Integrações.';
  if (code === 21215 || code === 21216) return 'A conta Twilio não tem permissão para ligar para este país/número (Voice > Settings > Geo Permissions).';
  if (code === 21211 || code === 13224) return 'Número inválido.';
  if (code === 21219) return 'Conta Twilio de teste: só liga para números verificados.';
  if (code === 20429 || code === 21212) return 'A Twilio limitou as ligações agora. Tentaremos de novo.';
  return error instanceof Error ? error.message.slice(0, 300) : 'A Twilio recusou a ligação.';
}

/** Erros que valem para a conta inteira: pausa a campanha em vez de queimar a fila. */
const accountWide = (error: unknown) => [20003, 21219, 20005].includes(Number((error as { code?: number })?.code));

// ── Ligação ─────────────────────────────────────────────────

export function placeDialerCall(config: TwilioConfig, contact: { id: string; phone: string }, campaign: { ringSeconds: number; detectVoicemail: boolean }) {
  return twilio(config.accountSid, config.authToken).calls.create({
    to: contact.phone,
    from: config.phoneNumber,
    url: publicUrl(`/api/twilio/dialer/answer?contact=${contact.id}`),
    method: 'POST',
    statusCallback: publicUrl(`/api/twilio/dialer/status?contact=${contact.id}`),
    statusCallbackEvent: ['completed'],
    statusCallbackMethod: 'POST',
    timeout: campaign.ringSeconds,
    ...(campaign.detectVoicemail ? { machineDetection: 'Enable' } : {}),
  });
}

async function loadContact(tenantId: string, contactId: string | null) {
  if (!contactId || !/^[0-9a-f-]{36}$/i.test(contactId)) return null;
  const { data } = await db.from('dialer_contacts').select('*').eq('tenant_id', tenantId).eq('id', contactId).maybeSingle();
  return (data as Row) || null;
}

/** Reserva o atendente livre há mais tempo (sem disputa: só um aviso consegue). */
async function claimAgent(tenantId: string, contactId: string): Promise<string | null> {
  const { data: candidates } = await db
    .from('dialer_agents')
    .select('profile_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'available')
    .gte('last_seen', freshCutoff())
    .order('status_since', { ascending: true })
    .limit(5);
  for (const candidate of candidates || []) {
    const { data } = await db
      .from('dialer_agents')
      .update({ status: 'on_call', contact_id: contactId, status_since: nowIso() })
      .eq('profile_id', candidate.profile_id)
      .eq('tenant_id', tenantId)
      .eq('status', 'available')
      .select('profile_id');
    if (data && data.length) return String(data[0].profile_id);
  }
  return null;
}

/** Atendeu: caixa postal desliga, pessoa vai para um atendente livre. */
export async function handleAnswer(tenantId: string, contactId: string | null, params: Record<string, string>): Promise<string> {
  const contact = await loadContact(tenantId, contactId);
  if (!contact || contact.status !== 'dialing') return HANGUP();
  const answeredBy = params.AnsweredBy || null;
  const now = nowIso();

  if (answeredBy && (answeredBy.startsWith('machine') || answeredBy === 'fax')) {
    await db.from('dialer_contacts').update({ status: 'voicemail', answered_by: answeredBy, ended_at: now, updated_at: now }).eq('tenant_id', tenantId).eq('id', contact.id);
    return HANGUP();
  }

  const agentId = await claimAgent(tenantId, String(contact.id));
  if (!agentId) {
    await db.from('dialer_contacts').update({ status: 'abandoned', answered_by: answeredBy, answered_at: now, error: 'Atendeu, mas nenhum atendente estava livre.', updated_at: now }).eq('tenant_id', tenantId).eq('id', contact.id);
    return twiml((response) => { say(response, SORRY); response.hangup(); });
  }

  await db.from('dialer_contacts').update({ status: 'connected', agent_id: agentId, answered_by: answeredBy, answered_at: now, updated_at: now }).eq('tenant_id', tenantId).eq('id', contact.id);
  const { error } = await db.from('call_logs').insert({
    tenant_id: tenantId,
    user_id: agentId,
    contact_number: contact.phone,
    direction: 'outbound',
    status: 'in-progress',
    call_sid: params.CallSid || contact.call_sid,
    dialer_contact_id: contact.id,
  });
  if (error) log('falha ao registrar no histórico', error.message);

  return twiml((response) => {
    const dial = response.dial({
      action: publicUrl(`/api/twilio/dialer/bridge?contact=${contact.id}&agent=${agentId}`),
      method: 'POST',
      timeout: AGENT_RING_SECONDS,
      record: 'record-from-answer',
      recordingStatusCallback: publicUrl(`/api/twilio/dialer/recording?contact=${contact.id}`),
      recordingStatusCallbackMethod: 'POST',
    });
    const client = dial.client();
    client.identity(twilioIdentity(agentId));
    client.parameter({ name: 'vtecDialer', value: '1' });
    client.parameter({ name: 'contactId', value: String(contact.id) });
    client.parameter({ name: 'contactName', value: String(contact.name || '').slice(0, 80) });
  });
}

/** Fim da conversa com o atendente (ou ele não atendeu no navegador). */
export async function handleBridge(tenantId: string, contactId: string | null, agentId: string | null, params: Record<string, string>): Promise<string> {
  const contact = await loadContact(tenantId, contactId);
  if (!contact) return HANGUP();
  const now = nowIso();
  const status = params.DialCallStatus;
  const talk = Number(params.DialCallDuration) || 0;
  const callSid = params.CallSid || String(contact.call_sid || '');

  if (status === 'completed' || status === 'answered') {
    await db.from('dialer_contacts').update({ status: 'completed', talk_seconds: talk, ended_at: contact.ended_at || now, updated_at: now }).eq('tenant_id', tenantId).eq('id', contact.id).in('status', ['connected', 'completed']);
    if (agentId) await db.from('dialer_agents').update({ status: 'wrapup', status_since: now }).eq('tenant_id', tenantId).eq('profile_id', agentId).eq('contact_id', String(contact.id)).eq('status', 'on_call');
    if (callSid) await db.from('call_logs').update({ status: 'completed', duration: talk }).eq('tenant_id', tenantId).eq('call_sid', callSid);
    return HANGUP();
  }

  // O navegador não aceitou: o atendente provavelmente saiu da tela.
  await db.from('dialer_contacts').update({ status: 'abandoned', error: 'O atendente não atendeu no navegador.', ended_at: now, updated_at: now }).eq('tenant_id', tenantId).eq('id', contact.id).eq('status', 'connected');
  if (agentId) await db.from('dialer_agents').update({ status: 'offline', contact_id: null, status_since: now }).eq('tenant_id', tenantId).eq('profile_id', agentId).eq('contact_id', String(contact.id));
  if (callSid) await db.from('call_logs').update({ status: 'no-answer', duration: 0 }).eq('tenant_id', tenantId).eq('call_sid', callSid);
  return twiml((response) => { say(response, SORRY); response.hangup(); });
}

const FINAL_BY_CALL_STATUS: Record<string, string> = { 'no-answer': 'no_answer', canceled: 'no_answer', busy: 'busy', failed: 'failed' };

/** Ligação encerrada (aviso de status): resultado de quem não chegou a atender. */
export async function handleCallStatus(tenantId: string, contactId: string | null, params: Record<string, string>) {
  const contact = await loadContact(tenantId, contactId);
  if (!contact) return;
  const now = nowIso();
  const duration = Number(params.CallDuration) || 0;
  const callStatus = params.CallStatus || '';

  if (contact.status === 'dialing') {
    const status = FINAL_BY_CALL_STATUS[callStatus] || 'failed';
    const error = status === 'failed' ? (params.ErrorMessage || (callStatus === 'completed' ? 'A ligação terminou sem passar pelo sistema.' : 'A ligação não completou.')).slice(0, 300) : null;
    await db.from('dialer_contacts').update({ status, duration, error, ended_at: now, updated_at: now }).eq('tenant_id', tenantId).eq('id', contact.id).eq('status', 'dialing');
    return;
  }

  await db.from('dialer_contacts').update({ duration, ended_at: contact.ended_at || now, updated_at: now }).eq('tenant_id', tenantId).eq('id', contact.id);
  // O cliente desligou antes do fim da ponte (sem aviso de bridge): libera o atendente.
  if (contact.status === 'connected') {
    await db.from('dialer_contacts').update({ status: 'completed' }).eq('tenant_id', tenantId).eq('id', contact.id).eq('status', 'connected');
    if (contact.agent_id) await db.from('dialer_agents').update({ status: 'wrapup', status_since: now }).eq('tenant_id', tenantId).eq('profile_id', String(contact.agent_id)).eq('contact_id', String(contact.id)).eq('status', 'on_call');
  }
}

/** Gravação pronta. */
export async function handleRecording(tenantId: string, contactId: string | null, params: Record<string, string>) {
  const contact = await loadContact(tenantId, contactId);
  if (!contact || !params.RecordingUrl) return;
  await db.from('dialer_contacts').update({ recording_url: params.RecordingUrl, updated_at: nowIso() }).eq('tenant_id', tenantId).eq('id', contact.id);
  const callSid = params.CallSid || String(contact.call_sid || '');
  if (callSid) {
    await db.from('call_logs').update({ recording_url: params.RecordingUrl, ...(params.RecordingDuration ? { duration: Number(params.RecordingDuration) || 0 } : {}) }).eq('tenant_id', tenantId).eq('call_sid', callSid);
  }
}

// ── Motor ───────────────────────────────────────────────────

async function notifyFinished(campaign: Row) {
  if (!campaign.created_by) return;
  const { data } = await db.rpc('dialer_campaign_counts', { p_tenant: campaign.tenant_id, p_campaign: campaign.id });
  const counts = Object.fromEntries(((data || []) as { status: string; total: number }[]).map((row) => [row.status, Number(row.total)]));
  const content = `${counts.completed || 0} atendida(s), ${counts.no_answer || 0} não atendeu, ${counts.voicemail || 0} caixa postal, ${counts.abandoned || 0} sem atendente livre.`;
  await db.from('system_notifications').insert({ user_id: campaign.created_by, type: 'campaign', title: `Discador: campanha "${campaign.name}" concluída`, content, is_read: false, link: `/discador?campanha=${campaign.id}` });
}

/** Limpeza: atendentes que sumiram e ligações sem retorno da Twilio. */
async function cleanup() {
  const cutoff = freshCutoff();
  // tenant-scope: ok (manutenção do motor, todas as empresas)
  await db.from('dialer_agents').update({ status: 'offline', contact_id: null, status_since: nowIso() }).in('status', ['available', 'paused', 'wrapup']).lt('last_seen', cutoff);
  const stuck = new Date(Date.now() - DIALING_STUCK_MS).toISOString();
  // tenant-scope: ok (manutenção do motor, todas as empresas)
  await db.from('dialer_contacts').update({ status: 'failed', error: 'Sem retorno da Twilio sobre esta ligação.', ended_at: nowIso(), updated_at: nowIso() }).eq('status', 'dialing').lt('dialed_at', stuck);
}

async function dialForTenant(tenantId: string, campaigns: Row[]) {
  const { count: available } = await db.from('dialer_agents').select('profile_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'available').gte('last_seen', freshCutoff());
  const { count: inflight } = await db.from('dialer_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'dialing');
  let busy = inflight || 0;
  let placed = 0;
  const config = (available || 0) > 0 ? await twilioConfigFor(tenantId) : null;

  for (const campaign of campaigns) {
    const { data: queue } = await db.from('dialer_contacts').select('id, phone').eq('tenant_id', tenantId).eq('campaign_id', campaign.id).eq('status', 'pending').order('position').limit(MAX_NEW_CALLS_PER_TICK);

    if (!queue || queue.length === 0) {
      const { count: open } = await db.from('dialer_contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('campaign_id', campaign.id).in('status', ['dialing', 'connected']);
      if (!open) {
        const { data: finished } = await db.from('dialer_campaigns').update({ status: 'finished', finished_at: nowIso(), updated_at: nowIso() }).eq('tenant_id', tenantId).eq('id', campaign.id).eq('status', 'running').select('*');
        if (finished && finished.length) await notifyFinished(finished[0] as Row);
      }
      continue;
    }
    if (!available || !config) continue;

    const slots = Math.min(available * Number(campaign.calls_per_agent || 1) - busy, MAX_NEW_CALLS_PER_TICK - placed, queue.length);
    for (const item of queue.slice(0, Math.max(0, slots))) {
      const { data: claimed } = await db.from('dialer_contacts').select('attempts').eq('tenant_id', tenantId).eq('id', item.id).maybeSingle();
      const now = nowIso();
      const { data: won } = await db
        .from('dialer_contacts')
        .update({ status: 'dialing', attempts: Number(claimed?.attempts || 0) + 1, dialed_at: now, error: null, call_sid: null, agent_id: null, answered_by: null, answered_at: null, ended_at: null, updated_at: now })
        .eq('tenant_id', tenantId)
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('id');
      if (!won || !won.length) continue;
      busy += 1;
      placed += 1;
      try {
        const call = await placeDialerCall(config, { id: String(item.id), phone: String(item.phone) }, { ringSeconds: Number(campaign.ring_seconds) || 25, detectVoicemail: campaign.detect_voicemail !== false });
        await db.from('dialer_contacts').update({ call_sid: call.sid }).eq('tenant_id', tenantId).eq('id', item.id);
      } catch (error) {
        busy -= 1;
        if (accountWide(error)) {
          // Problema da conta: devolve o contato à fila e pausa a campanha.
          await db.from('dialer_contacts').update({ status: 'pending', attempts: Number(claimed?.attempts || 0), dialed_at: null }).eq('tenant_id', tenantId).eq('id', item.id);
          await db.from('dialer_campaigns').update({ status: 'paused', last_error: friendlyTwilioError(error), updated_at: nowIso() }).eq('tenant_id', tenantId).eq('id', campaign.id);
          return;
        }
        await db.from('dialer_contacts').update({ status: 'failed', error: friendlyTwilioError(error), ended_at: nowIso() }).eq('tenant_id', tenantId).eq('id', item.id);
      }
    }
  }
}

export async function runDialerTick() {
  await cleanup();
  // tenant-scope: ok (o motor percorre as campanhas ligando de todas as empresas)
  const { data } = await db.from('dialer_campaigns').select('*').eq('status', 'running').order('started_at', { ascending: true });
  const byTenant = new Map<string, Row[]>();
  for (const campaign of (data || []) as Row[]) {
    const list = byTenant.get(String(campaign.tenant_id)) || [];
    list.push(campaign);
    byTenant.set(String(campaign.tenant_id), list);
  }
  for (const [tenantId, campaigns] of byTenant) {
    try {
      await dialForTenant(tenantId, campaigns);
    } catch (error) {
      log(`erro na empresa ${tenantId}`, error);
    }
  }
}

type WorkerState = { timer: ReturnType<typeof setInterval> | null; running: boolean };
const holder = globalThis as typeof globalThis & { __vtecDialerWorker?: WorkerState };
const worker = holder.__vtecDialerWorker ?? { timer: null, running: false };
holder.__vtecDialerWorker = worker;

export function startDialerWorker() {
  if (worker.timer) return;
  const run = async () => {
    if (worker.running) return;
    worker.running = true;
    try {
      await runDialerTick();
      beat('discador');
    } catch (error) {
      log('erro no ciclo', error);
      beat('discador', error);
    } finally {
      worker.running = false;
    }
  };
  worker.timer = setInterval(() => void run(), TICK_MS);
  console.log('[discador] motor de ligações iniciado (verifica a cada 3s)');
  void run();
}
