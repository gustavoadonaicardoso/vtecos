/**
 * ============================================================
 * VTEC OS — Agendamento: envio das mensagens agendadas e lembretes
 * ============================================================
 * Roda no servidor (VPS) a cada minuto, ligado pelo src/instrumentation.ts
 * só em produção com CONTENT_SCHEDULER_ENABLED=true -- nunca no
 * `npm run dev` nem nos previews da Vercel (sem WhatsApp conectado lá,
 * eles marcariam os envios como falhos).
 *
 * Cada envio é "reivindicado" (pending → sending) antes de sair: mesmo
 * com dois processos, a mensagem sai uma vez só.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { beat } from '@/lib/heartbeat';
import { TIME_ZONE } from '@/services/scheduling.service';

type Row = Record<string, unknown>;

/** Atrasou mais que isto (servidor fora do ar)? Não envia fora de hora. */
const MAX_LATE_MS = 6 * 3600_000;
const STUCK_MS = 15 * 60_000;

const log = (...args: unknown[]) => console.log('[agendamento]', ...args);

async function notify(userId: string | null, title: string, content: string, link: string) {
  if (!userId) return;
  const { error } = await supabaseAdmin.from('system_notifications').insert({ user_id: userId, type: 'task', title, content, is_read: false, link });
  if (error) log('falha ao avisar', userId, error.message);
}

async function finishSend(row: Row, ok: boolean, error?: string) {
  await supabaseAdmin
    .from('scheduled_messages')
    .update({ status: ok ? 'sent' : 'failed', error: ok ? null : error || 'Falha ao enviar.', sent_at: ok ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('tenant_id', row.tenant_id as string)
    .eq('id', row.id as string);
  if (!ok) {
    await notify(
      (row.created_by as string) || null,
      'Envio agendado não saiu',
      `A mensagem para ${row.lead_name || 'o lead'} não foi enviada: ${error || 'falha ao enviar'}.`,
      '/scheduling?tab=sends',
    );
  }
}

async function sendOne(row: Row) {
  const tenantId = row.tenant_id as string;
  if (Date.now() - new Date(String(row.send_at)).getTime() > MAX_LATE_MS) {
    return finishSend(row, false, 'O servidor estava fora do ar no horário marcado. Reagende se ainda fizer sentido.');
  }
  if (!row.lead_id) return finishSend(row, false, 'O lead foi excluído.');

  const { data: lead } = await supabaseAdmin.from('leads').select('id, name, phone, assigned_to, blocked').eq('tenant_id', tenantId).eq('id', row.lead_id as string).maybeSingle();
  if (!lead) return finishSend(row, false, 'O lead foi excluído.');
  if (lead.blocked) return finishSend(row, false, 'O contato está bloqueado.');

  const { sendTextToLead } = await import('@/services/conversations.service');
  const result = await sendTextToLead(
    tenantId,
    (row.created_by as string) || null,
    { id: lead.id, name: lead.name || '', phone: lead.phone || '', assigned_to: lead.assigned_to || null, blocked: false },
    String(row.message || ''),
    null,
    'scheduled',
  );
  return finishSend(row, result.ok, result.ok ? undefined : result.error);
}

async function processSends() {
  const now = new Date().toISOString();

  // Envio que ficou preso em "enviando" (servidor reiniciou no meio).
  // tenant-scope: ok (agendador do servidor percorre todas as empresas)
  await supabaseAdmin
    .from('scheduled_messages')
    .update({ status: 'failed', error: 'O envio foi interrompido (o servidor reiniciou). Confira na conversa antes de reagendar.', updated_at: now })
    .eq('status', 'sending')
    .lt('updated_at', new Date(Date.now() - STUCK_MS).toISOString());

  // tenant-scope: ok (agendador do servidor percorre todas as empresas)
  const { data: due } = await supabaseAdmin.from('scheduled_messages').select('id, tenant_id').eq('status', 'pending').lte('send_at', now).order('send_at').limit(20);
  for (const item of due || []) {
    const { data: claimed } = await supabaseAdmin
      .from('scheduled_messages')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('tenant_id', item.tenant_id)
      .eq('id', item.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (!claimed) continue; // outro processo pegou
    try {
      await sendOne(claimed as Row);
    } catch (error) {
      await finishSend(claimed as Row, false, error instanceof Error ? error.message : 'Falha ao enviar.');
    }
  }
}

function reminderText(row: Row) {
  const startsAt = new Date(String(row.starts_at));
  const when = startsAt.toLocaleString('pt-BR', { timeZone: TIME_ZONE, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const lead = (row.lead_ref as { name?: string } | null)?.name;
  return `${row.type === 'task' ? 'Tarefa' : 'Compromisso'} ${when}${lead ? ` · ${lead}` : ''}`;
}

async function processReminders() {
  const now = Date.now();
  // Lembrete máximo é de 7 dias antes; compromisso que já passou há mais de 1 h não é lembrado.
  // tenant-scope: ok (agendador do servidor percorre todas as empresas)
  const { data } = await supabaseAdmin
    .from('scheduling_items')
    .select('id, tenant_id, title, type, starts_at, remind_minutes, assigned_to, created_by, lead_ref:leads(name)')
    .not('remind_minutes', 'is', null)
    .is('reminded_at', null)
    .neq('status', 'done')
    .gte('starts_at', new Date(now - 3600_000).toISOString())
    .lte('starts_at', new Date(now + 7 * 86400_000).toISOString())
    .limit(500);

  for (const row of (data || []) as unknown as Row[]) {
    const remindAt = new Date(String(row.starts_at)).getTime() - Number(row.remind_minutes) * 60_000;
    if (remindAt > now) continue;
    const { data: claimed } = await supabaseAdmin
      .from('scheduling_items')
      .update({ reminded_at: new Date().toISOString() })
      .eq('tenant_id', row.tenant_id as string)
      .eq('id', row.id as string)
      .is('reminded_at', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    await notify(
      (row.assigned_to as string) || (row.created_by as string) || null,
      `Lembrete: ${row.title}`,
      reminderText(row),
      `/scheduling?item=${row.id}`,
    );
  }
}

type WorkerState = { timer: ReturnType<typeof setInterval> | null; running: boolean };
const globalState = globalThis as typeof globalThis & { __vtecSchedulingWorker?: WorkerState };
const worker = globalState.__vtecSchedulingWorker ?? { timer: null, running: false };
globalState.__vtecSchedulingWorker = worker;

export async function runSchedulingTick() {
  await processSends();
  await processReminders();
}

export function startSchedulingWorker() {
  if (worker.timer) return;
  const run = async () => {
    if (worker.running) return;
    worker.running = true;
    try {
      await runSchedulingTick();
      beat('agendamento');
    } catch (error) {
      log('erro no agendador', error);
      beat('agendamento', error);
    } finally {
      worker.running = false;
    }
  };
  worker.timer = setInterval(() => void run(), 60_000);
  log('envios agendados e lembretes ligados (a cada 60s)');
  void run();
}
