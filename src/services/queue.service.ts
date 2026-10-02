/**
 * ============================================================
 * VÓRTICE CRM — Fila de Atendimento Service
 * ============================================================
 * Operações de banco para a fila de senhas (attendance_queue_tickets).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

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
export async function syncLeadFromTicket(params: {
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
      const { data } = await supabase.from('leads').select('id, name, phone, cpf_cnpj, tags').eq('phone', params.whatsapp).limit(1).maybeSingle();
      existing = data;
    }
    if (!existing && params.document) {
      const { data } = await supabase.from('leads').select('id, name, phone, cpf_cnpj, tags').eq('cpf_cnpj', params.document).limit(1).maybeSingle();
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
        .eq('id', existing.id);
      if (error) console.error('[QueueService] Falha ao atualizar lead da senha:', error.message);
      return;
    }

    const { data: firstStage } = await supabase.from('pipeline_stages').select('id').order('position').limit(1).maybeSingle();
    const { error } = await supabase.from('leads').insert([{
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
export async function createQueueTicket(params: {
  name: string;
  whatsapp: string | null;
  document: string | null;
  origin?: TicketOrigin;
}): Promise<{ number: number }> {
  const { data: ticket, error } = await supabase
    .from('attendance_queue_tickets')
    .insert({ name: params.name, status: 'waiting' })
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
      .insert({ ticket_id: ticket.id, whatsapp: params.whatsapp, document: params.document });

    if (contactError) {
      console.error('[QueueService] Erro ao salvar contato da senha:', contactError.message);
    }
  }

  await syncLeadFromTicket({
    name: params.name,
    whatsapp: params.whatsapp,
    document: params.document,
    origin: params.origin ?? 'totem',
  });

  return { number: ticket.number };
}
