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
    .insert({ name: params.name, whatsapp: params.whatsapp, document: params.document, status: 'waiting' })
    .select('number')
    .single();

  if (error) throw error;
  return ticket;
}
