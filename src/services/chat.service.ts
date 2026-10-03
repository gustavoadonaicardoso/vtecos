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

/** Os ids informados são todos usuários desta empresa? */
async function allInTenant(tenantId: string, userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return true;
  const { data } = await supabase.from('profiles').select('id').eq('tenant_id', tenantId).in('id', unique);
  return (data || []).length === unique.length;
}

async function isGroupMember(tenantId: string, groupId: string, userId: string) {
  const { data } = await supabase
    .from('chat_group_members')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Envia mensagem do chat interno. Remetente e empresa vêm da sessão; o
 * destinatário (ou o grupo) precisa ser da mesma empresa.
 */
export async function sendInternalMessage(
  tenantId: string,
  senderId: string,
  type: MessageType,
  payload: { receiver_id?: string; group_id?: string; text: string } & Record<string, unknown>
): Promise<ServiceResult> {
  if (type === 'direct') {
    if (!payload.receiver_id || !(await allInTenant(tenantId, [payload.receiver_id]))) {
      return { success: false, error: 'Destinatário não encontrado.' };
    }
  } else if (!payload.group_id || !(await isGroupMember(tenantId, payload.group_id, senderId))) {
    return { success: false, error: 'Grupo não encontrado.' };
  }

  const row = { ...payload, sender_id: senderId, tenant_id: tenantId };
  const { data, error } = await supabase.from(tableForMessageType(type)).insert([row]).select().single();

  if (error) return { success: false, error: error.message };

  await notifyMessageRecipients(tenantId, type, row);

  return { success: true, data };
}

/**
 * Cria as notificações (system_notifications) para quem deve saber de
 * uma nova mensagem interna. Falhas aqui nunca derrubam o envio.
 */
async function notifyMessageRecipients(
  tenantId: string,
  type: MessageType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const senderId = payload.sender_id as string;

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('tenant_id', tenantId)
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
      supabase.from('chat_groups').select('name').eq('tenant_id', tenantId).eq('id', groupId).single(),
      supabase.from('chat_group_members').select('user_id').eq('tenant_id', tenantId).eq('group_id', groupId).neq('user_id', senderId),
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

/** Só o autor edita/apaga a própria mensagem, e só dentro da empresa. */
export async function editInternalMessage(tenantId: string, senderId: string, type: MessageType, id: string, text: string): Promise<ServiceResult> {
  const { data, error } = await supabase
    .from(tableForMessageType(type))
    .update({ text: text.trim(), is_edited: true })
    .eq('tenant_id', tenantId)
    .eq('sender_id', senderId)
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: 'Mensagem não encontrada.' };
  return { success: true };
}

export async function deleteInternalMessage(tenantId: string, senderId: string, type: MessageType, id: string): Promise<ServiceResult> {
  const { data, error } = await supabase
    .from(tableForMessageType(type))
    .delete()
    .eq('tenant_id', tenantId)
    .eq('sender_id', senderId)
    .eq('id', id)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: 'Mensagem não encontrada.' };
  return { success: true };
}

/**
 * Cria um grupo de chat interno e adiciona os membros (incluindo o
 * criador como admin). Todos precisam ser da mesma empresa.
 */
export async function createChatGroup(
  tenantId: string,
  name: string,
  createdBy: string,
  members: string[]
): Promise<ServiceResult<{ group: Record<string, unknown>; warning?: string }>> {
  const memberIds = Array.from(new Set([...members, createdBy]));
  if (!(await allInTenant(tenantId, memberIds))) {
    return { success: false, error: 'Algum membro não faz parte da sua empresa.' };
  }

  const { data: groupData, error: groupError } = await supabase
    .from('chat_groups')
    .insert([{ tenant_id: tenantId, name: name.trim(), created_by: createdBy }])
    .select()
    .single();

  if (groupError || !groupData) {
    return { success: false, error: groupError?.message || 'Erro ao criar grupo.' };
  }

  const membersToInsert = memberIds.map((userId) => ({
    tenant_id: tenantId,
    group_id: groupData.id,
    user_id: userId,
    is_admin: userId === createdBy,
  }));

  // tenant-scope: ok (cada linha de membersToInsert leva tenant_id)
  const { error: membersError } = await supabase.from('chat_group_members').insert(membersToInsert);

  if (membersError) {
    // Grupo foi criado mas membros falharam — retorna o grupo mesmo assim
    return { success: true, data: { group: groupData, warning: membersError.message } };
  }

  return { success: true, data: { group: groupData } };
}
