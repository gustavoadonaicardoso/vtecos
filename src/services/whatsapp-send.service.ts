/**
 * ============================================================
 * VÓRTICE CRM — Persistência de mensagens de saída (Meta Cloud API)
 * ============================================================
 * Usado por src/app/api/whatsapp/send/route.ts para registrar o
 * histórico de chat_messages antes/depois de enviar pela Meta.
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function createOutboundMessageRecord(params: {
  leadId: string;
  text: string;
  type: string;
}): Promise<string | null> {
  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert([{
      lead_id: params.leadId,
      text: params.text,
      sent_by_me: true,
      type: params.type === 'text' ? 'text' : (params.type === 'audio' ? 'audio' : params.type),
      status: 'sending',
      provider: 'meta',
    }])
    .select('id')
    .single();

  if (error || !msg) return null;
  return msg.id;
}

export async function markMessageFailed(dbMessageId: string) {
  await supabase.from('chat_messages').update({ status: 'failed' }).eq('id', dbMessageId);
}

export async function markMessageResult(dbMessageId: string, success: boolean, externalId?: string) {
  await supabase
    .from('chat_messages')
    .update({
      status: success ? 'sent' : 'failed',
      external_id: success ? externalId : undefined,
    })
    .eq('id', dbMessageId);
}
