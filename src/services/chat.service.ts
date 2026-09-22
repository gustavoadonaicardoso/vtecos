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
  return { success: true, data };
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
