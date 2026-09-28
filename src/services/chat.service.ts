/**
 * ============================================================
 * VÓRTICE CRM — Chat Interno Service
 * ============================================================
 * Responsável pelas operações de banco do chat interno da equipe
 * (internal_chat, chat_groups, chat_group_members, chat_group_messages).
 * Não confundir com o chat de atendimento a leads (chat_messages),
 * que vive em src/services/leads.service.ts / src/lib/messaging.ts.
 * ============================================================
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import type { ServiceResult } from '@/types';

type MessageType = 'group' | 'direct';

function tableForMessageType(type: MessageType) {
  return type === 'group' ? 'chat_group_messages' : 'internal_chat';
}

export async function sendInternalMessage(
  type: MessageType,
  payload: Record<string, unknown>
): Promise<ServiceResult> {
  const { data, error } = await supabase
    .from(tableForMessageType(type))
    .insert([payload])
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await notifyMessageRecipients(type, payload);

  return { success: true, data };
}

/**
 * Cria as notificações (system_notifications) para quem deve saber
 * de uma nova mensagem interna. Roda com supabaseAdmin (service_role)
 * porque o navegador nunca tem sessão real do Supabase Auth (login
 * é próprio/localStorage) -- inserir isso direto do cliente com a
 * anon key ficaria refém de RLS/grants exatamente certos, então
 * fazemos aqui, no mesmo lugar que já envia a mensagem com
 * privilégio total. Falhas aqui nunca devem derrubar o envio da
 * mensagem em si, por isso não propagam erro.
 */
async function notifyMessageRecipients(
  type: MessageType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const senderId = payload.sender_id as string;

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', senderId)
      .single();
    const senderName = senderProfile?.name || 'Alguém';

    if (type === 'direct') {
      const receiverId = payload.receiver_id as string;
      if (!receiverId) return;

      const { error } = await supabase.from('system_notifications').insert([{
        user_id: receiverId,
        type: 'chat',
        title: 'Nova mensagem interna',
        content: `${senderName} enviou uma mensagem no chat interno.`,
        is_read: false,
        link: `/chat?userId=${senderId}`,
      }]);
      if (error) console.error('[chat.service] Erro ao notificar mensagem direta:', error.message);
      return;
    }

    const groupId = payload.group_id as string;
    if (!groupId) return;

    const [{ data: group }, { data: members }] = await Promise.all([
      supabase.from('chat_groups').select('name').eq('id', groupId).single(),
      supabase.from('chat_group_members').select('user_id').eq('group_id', groupId).neq('user_id', senderId),
    ]);

    if (!members || members.length === 0) return;

    const { error } = await supabase.from('system_notifications').insert(
      members.map((m) => ({
        user_id: m.user_id,
        type: 'chat',
        title: `Nova mensagem em ${group?.name || 'grupo'}`,
        content: `${senderName} enviou uma mensagem no grupo.`,
        is_read: false,
        link: `/chat?userId=${groupId}`,
      }))
    );
    if (error) console.error('[chat.service] Erro ao notificar mensagem de grupo:', error.message);
  } catch (err) {
    console.error('[chat.service] Erro inesperado ao criar notificações:', err);
  }
}

export async function editInternalMessage(type: MessageType, id: string, text: string): Promise<ServiceResult> {
  const { error } = await supabase
    .from(tableForMessageType(type))
    .update({ text: text.trim(), is_edited: true })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteInternalMessage(type: MessageType, id: string): Promise<ServiceResult> {
  const { error } = await supabase.from(tableForMessageType(type)).delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Cria um grupo de chat interno e adiciona os membros (incluindo o
 * criador como admin). Se a criação do grupo falhar por completo,
 * retorna erro; se só a inserção dos membros falhar, retorna o grupo
 * com um aviso (`warning`) para o chamador decidir como lidar.
 */
export async function createChatGroup(
  name: string,
  createdBy: string,
  members: string[]
): Promise<ServiceResult<{ group: any; warning?: string }>> {
  const { data: groupData, error: groupError } = await supabase
    .from('chat_groups')
    .insert([{ name: name.trim(), created_by: createdBy }])
    .select()
    .single();

  if (groupError || !groupData) {
    return { success: false, error: groupError?.message || 'Erro ao criar grupo.' };
  }

  const memberIds = Array.from(new Set([...members, createdBy]));
  const membersToInsert = memberIds.map((userId) => ({
    group_id: groupData.id,
    user_id: userId,
    is_admin: userId === createdBy,
  }));

  const { error: membersError } = await supabase.from('chat_group_members').insert(membersToInsert);

  if (membersError) {
    // Grupo foi criado mas membros falharam — retorna o grupo mesmo assim
    return { success: true, data: { group: groupData, warning: membersError.message } };
  }

  return { success: true, data: { group: groupData } };
}
