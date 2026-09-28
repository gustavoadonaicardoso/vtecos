/**
 * ============================================================
 * VÓRTICE CRM — Fila de Atendimento Service
 * ============================================================
 * Operações de banco para a fila de senhas (attendance_queue_tickets).
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

/** Lança o erro do Postgres como veio (código/detalhe/hint incluídos) para a rota logar. */
export async function createQueueTicket(params: {
  name: string;
  whatsapp: string | null;
  document: string | null;
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

  return { number: ticket.number };
}
