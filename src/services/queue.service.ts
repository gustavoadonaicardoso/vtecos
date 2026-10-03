/**
 * ============================================================
 * VÓRTICE CRM — Fila de Atendimento Service
 * ============================================================
 * Operações de banco para a fila de senhas (attendance_queue_tickets).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { sendWhatsAppWebMessage } from '@/lib/whatsapp-web';

export type TicketOrigin = 'totem' | 'recepcao';

const ORIGIN_LABEL: Record<TicketOrigin, string> = {
  totem: 'Totem',
  recepcao: 'Recepção',
};

/** Nome padrão da senha manual sem dados -- não vira lead (não identifica ninguém). */
export const ANONYMOUS_TICKET_NAME = 'Cliente (Manual)';

/**
 * Todo nome/WhatsApp/documento que entra na fila vira lead. Se a pessoa já
 * existe (mesmo WhatsApp ou mesmo documento), atualiza o lead em vez de
 * duplicar: completa dados que faltavam, marca a tag "Senha" e registra a
 * atividade. Roda no servidor porque o Totem é público e a tabela de leads
 * não aceita escrita anônima -- antes, a criação pelo navegador falhava
 * em silêncio. Nunca derruba a emissão da senha.
 */
export async function syncLeadFromTicket(tenantId: string, params: {
  name: string;
  whatsapp: string | null;
  document: string | null;
  origin: TicketOrigin;
}): Promise<void> {
  const name = params.name.trim();
  const hasIdentity = Boolean(params.whatsapp || params.document);
  if (!hasIdentity && (!name || name === ANONYMOUS_TICKET_NAME)) return;

  const now = new Date().toISOString();
  const originLabel = ORIGIN_LABEL[params.origin];

  try {
    let existing: { id: string; name: string | null; phone: string | null; cpf_cnpj: string | null; tags: string[] | null } | null = null;
    if (params.whatsapp) {
      const { data } = await supabase.from('leads').select('id, name, phone, cpf_cnpj, tags').eq('tenant_id', tenantId).eq('phone', params.whatsapp).limit(1).maybeSingle();
      existing = data;
    }
    if (!existing && params.document) {
      const { data } = await supabase.from('leads').select('id, name, phone, cpf_cnpj, tags').eq('tenant_id', tenantId).eq('cpf_cnpj', params.document).limit(1).maybeSingle();
      existing = data;
    }

    if (existing) {
      const tags = [...new Set([...(existing.tags || []), 'Senha', originLabel])];
      const { error } = await supabase
        .from('leads')
        .update({
          name: existing.name?.trim() ? existing.name : name,
          phone: existing.phone || params.whatsapp,
          cpf_cnpj: existing.cpf_cnpj || params.document,
          tags,
          last_activity_at: now,
          last_msg: `Retirou senha (${originLabel})`,
        })
        .eq('tenant_id', tenantId)
        .eq('id', existing.id);
      if (error) console.error('[QueueService] Falha ao atualizar lead da senha:', error.message);
      return;
    }

    const { data: firstStage } = await supabase.from('pipeline_stages').select('id').eq('tenant_id', tenantId).order('position').limit(1).maybeSingle();
    const { error } = await supabase.from('leads').insert([{
      tenant_id: tenantId,
      name: name || 'Visitante',
      phone: params.whatsapp,
      cpf_cnpj: params.document,
      source: originLabel === 'Totem' ? 'Totem' : 'Recepção (senha)',
      stage_id: firstStage?.id || 'novo',
      tags: ['Senha', originLabel, 'Presencial'],
      last_activity_at: now,
      last_msg: `Retirou senha (${originLabel})`,
    }]);
    if (error) console.error('[QueueService] Falha ao criar lead da senha:', error.message);
  } catch (error) {
    console.error('[QueueService] Falha ao sincronizar lead da senha:', error);
  }
}

/** Lança o erro do Postgres como veio (código/detalhe/hint incluídos) para a rota logar. */
export async function createQueueTicket(tenant: { id: string; name: string }, params: {
  name: string;
  whatsapp: string | null;
  document: string | null;
  origin?: TicketOrigin;
}): Promise<{ number: number }> {
  const { data: ticket, error } = await supabase
    .from('attendance_queue_tickets')
    .insert({ tenant_id: tenant.id, name: params.name, status: 'waiting' })
    .select('id, number')
    .single();

  if (error) throw error;

  // whatsapp/document vivem numa tabela separada que nem anon nem
  // authenticated conseguem ler (ver 202609290001_secure_queue_pii.sql)
  // -- evita expor CPF/RG/telefone de todo mundo que já passou pelo
  // Totem via chave pública do site.
  if (params.whatsapp || params.document) {
    const { error: contactError } = await supabase
      .from('attendance_queue_contacts')
      .insert({ tenant_id: tenant.id, ticket_id: ticket.id, whatsapp: params.whatsapp, document: params.document });

    if (contactError) {
      console.error('[QueueService] Erro ao salvar contato da senha:', contactError.message);
    }
  }

  await syncLeadFromTicket(tenant.id, {
    name: params.name,
    whatsapp: params.whatsapp,
    document: params.document,
    origin: params.origin ?? 'totem',
  });

  // Confirmação no WhatsApp sem segurar a resposta do Totem (o envio pode demorar).
  if (params.whatsapp) {
    void sendTicketWhatsApp(
      tenant.id,
      params.whatsapp,
      `🌟 *${tenant.name}* 🌟\n\n${firstName(params.name) ? `Olá, ${firstName(params.name)}!` : 'Olá!'} Sua senha foi retirada com sucesso.\n\nSenha: *#${ticketLabel(ticket.number)}*\n\nAcompanhe o painel. Quando for sua vez, avisaremos também por aqui.`
    );
  }

  return { number: ticket.number };
}

// ── WhatsApp da fila ───────────────────────────────────────────

const ticketLabel = (value: number) => value.toString().padStart(2, '0');

/** Primeiro nome para a saudação; vazio quando a senha não tem nome real. */
function firstName(name: string | null | undefined) {
  const first = (name || '').trim().split(/\s+/)[0];
  return first && first !== 'Cliente' && first !== 'Visitante' ? first : '';
}

/** Envia pelo WhatsApp Web conectado no sistema. Nunca lança: devolve o motivo da falha. */
async function sendTicketWhatsApp(tenantId: string, phone: string, message: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    // Sai pelo WhatsApp da própria empresa.
    await sendWhatsAppWebMessage(tenantId, phone, message);
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Falha no envio.';
    console.error('[QueueService] WhatsApp da senha não enviado:', reason);
    return { sent: false, reason };
  }
}

export type TicketNotifyKind = 'call' | 'recall';

/**
 * Avisa no WhatsApp que a senha foi chamada (ou chamada de novo) e em qual
 * guichê. O número fica em attendance_queue_contacts, que só o servidor lê.
 */
export async function notifyTicketCall(tenant: { id: string; name: string }, ticketId: string, kind: TicketNotifyKind): Promise<{ sent: boolean; reason?: string }> {
  const [{ data: ticket }, { data: contact }] = await Promise.all([
    supabase.from('attendance_queue_tickets').select('number, name, desk, status').eq('tenant_id', tenant.id).eq('id', ticketId).maybeSingle(),
    supabase.from('attendance_queue_contacts').select('whatsapp').eq('tenant_id', tenant.id).eq('ticket_id', ticketId).maybeSingle(),
  ]);

  if (!ticket) return { sent: false, reason: 'Senha não encontrada.' };
  if (!contact?.whatsapp) return { sent: false, reason: 'Sem WhatsApp cadastrado.' };

  const desk = ticket.desk ? `Guichê ${ticket.desk}` : 'atendimento';
  const message =
    kind === 'call'
      ? `📢 *${tenant.name}*\n\n${firstName(ticket.name) ? `${firstName(ticket.name)}, chegou a sua vez!` : 'Chegou a sua vez!'}\n\nSenha *#${ticketLabel(ticket.number)}* chamada.\nDirija-se ao *${desk}*.`
      : `🔔 *${tenant.name}*\n\nLembrete: sua senha *#${ticketLabel(ticket.number)}* está sendo chamada no *${desk}*.`;

  return sendTicketWhatsApp(tenant.id, contact.whatsapp, message);
}
