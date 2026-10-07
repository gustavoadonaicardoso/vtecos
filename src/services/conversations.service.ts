/**
 * ============================================================
 * VTEC OS — Conversas (tela Mensagens), server-only
 * ============================================================
 * Envia pelo WhatsApp da empresa: WhatsApp Web (QR Code) quando está
 * conectado, senão a API oficial da Meta. Grava a mensagem antes de
 * enviar (status "sending") e atualiza para "sent" ou "failed" -- a tela
 * acompanha pelo Realtime. O gatilho do banco cuida de "não lidas" e da
 * última atividade do lead.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { insertChatMessage } from '@/lib/chat-messages';

type Row = Record<string, unknown>;

export interface ChatLead {
  id: string;
  name: string;
  phone: string;
  assigned_to: string | null;
  blocked: boolean;
}

export type SendResult = { ok: true; message: Row } | { ok: false; error: string; message?: Row };

/** Quais conexões de WhatsApp a empresa tem prontas para enviar. */
export async function whatsappChannels(tenantId: string) {
  const [{ getWhatsAppWebStatus }, { data: meta }] = await Promise.all([
    import('@/lib/whatsapp-web'),
    supabaseAdmin.from('integrations_config').select('provider').eq('tenant_id', tenantId).eq('provider', 'whatsapp_meta').maybeSingle(),
  ]);
  return { web: getWhatsAppWebStatus(tenantId).connected, api: Boolean(meta) };
}

/** Lead desta empresa que a pessoa pode atender (vendedor: só os dele). */
export async function loadChatLead(tenantId: string, leadId: string, profile: { id: string; role: string }): Promise<ChatLead | { error: string; status: number }> {
  const { data } = await supabaseAdmin.from('leads').select('*').eq('tenant_id', tenantId).eq('id', leadId).maybeSingle();
  if (!data) return { error: 'Conversa não encontrada.', status: 404 };
  const lead = data as Row;
  if (!['ADMIN', 'MANAGER'].includes(profile.role) && lead.assigned_to !== profile.id) {
    return { error: 'Esta conversa está com outra pessoa da equipe.', status: 403 };
  }
  return { id: String(lead.id), name: String(lead.name || ''), phone: String(lead.phone || ''), assigned_to: (lead.assigned_to as string) || null, blocked: lead.blocked === true };
}

function friendlyError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error || '');
  if (/131047|24 hours|re-engagement/i.test(text)) return 'Passaram 24 h desde a última mensagem do cliente: pela API oficial, só dá para enviar um modelo aprovado pela Meta.';
  if (/not connected|desconectad|Connection Closed/i.test(text)) return 'O WhatsApp Web desconectou. Reconecte em Integrações.';
  return text || 'Falha ao enviar.';
}

async function finish(tenantId: string, messageId: string, ok: boolean, externalId?: string | null) {
  const { data } = await supabaseAdmin
    .from('chat_messages')
    .update({ status: ok ? 'sent' : 'failed', ...(externalId ? { external_id: externalId } : {}) })
    .eq('tenant_id', tenantId)
    .eq('id', messageId)
    .select()
    .maybeSingle();
  return (data || { id: messageId, status: ok ? 'sent' : 'failed' }) as Row;
}

async function touchPreview(tenantId: string, leadId: string, preview: string) {
  await supabaseAdmin.from('leads').update({ last_msg: preview.slice(0, 200) }).eq('tenant_id', tenantId).eq('id', leadId);
}

/**
 * Alguém da equipe respondeu o cliente: o Atendente com IA fica quieto
 * pelo tempo configurado no bloco (ver src/lib/automations/engine.ts).
 */
export async function markHumanReply(tenantId: string, leadId: string) {
  await supabaseAdmin.from('leads').update({ human_replied_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', leadId);
}

/** Botão "Pausar IA" / "Retomar IA" da conversa. Pausa vale até alguém retomar (30 dias, no máximo). */
export async function setAiPaused(tenantId: string, leadId: string, paused: boolean) {
  const changes = paused
    ? { ai_paused_until: new Date(Date.now() + 30 * 24 * 3600_000).toISOString() }
    : { ai_paused_until: null, human_replied_at: null };
  const { data, error } = await supabaseAdmin.from('leads').update(changes).eq('tenant_id', tenantId).eq('id', leadId).select('ai_paused_until').maybeSingle();
  if (error) return { ok: false as const, error: error.message.includes('ai_paused_until') ? 'Falta rodar a migration 202610200001_ai_attendant.sql no Supabase.' : error.message };
  if (!data) return { ok: false as const, error: 'Conversa não encontrada.' };
  return { ok: true as const, aiPausedUntil: (data.ai_paused_until as string | null) ?? null };
}

/** Texto da equipe para o cliente. `retryId`: reenvia uma mensagem que falhou. */
export async function sendTextToLead(tenantId: string, senderId: string | null, lead: ChatLead, text: string, retryId?: string | null, origin: 'team' | 'scheduled' = 'team'): Promise<SendResult> {
  if (!lead.phone) return { ok: false, error: 'Este contato não tem telefone.' };
  const channels = await whatsappChannels(tenantId);
  if (!channels.web && !channels.api) return { ok: false, error: 'Nenhum WhatsApp conectado. Conecte o WhatsApp Web ou a API oficial em Integrações.' };
  const provider = channels.web ? 'whatsapp_web' : 'meta';

  let messageId: string;
  if (retryId) {
    const { data } = await supabaseAdmin.from('chat_messages').update({ status: 'sending', provider }).eq('tenant_id', tenantId).eq('id', retryId).eq('lead_id', lead.id).eq('status', 'failed').select('id').maybeSingle();
    if (!data) return { ok: false, error: 'Essa mensagem já foi reenviada.' };
    messageId = data.id;
  } else {
    const { data, error } = await insertChatMessage({ tenant_id: tenantId, lead_id: lead.id, text, type: 'text', sent_by_me: true, status: 'sending', provider, sent_by: senderId, origin }, 'id');
    if (error || !data) return { ok: false, error: error?.message || 'Não foi possível registrar a mensagem.' };
    messageId = String(data.id);
  }

  try {
    let externalId: string | null = null;
    if (provider === 'whatsapp_web') {
      const { sendWhatsAppWebMessage } = await import('@/lib/whatsapp-web');
      const sent = await sendWhatsAppWebMessage(tenantId, lead.phone, text);
      externalId = sent?.key?.id ?? null;
    } else {
      const { WhatsAppService, getWhatsAppConfig } = await import('@/lib/whatsapp');
      const service = new WhatsAppService(await getWhatsAppConfig(supabaseAdmin, tenantId));
      const result = await service.sendText(lead.phone, text);
      if (!result.success) throw new Error(result.error || 'A Meta recusou a mensagem.');
      externalId = (result as { messageId?: string }).messageId ?? null;
    }
    const message = await finish(tenantId, messageId, true, externalId);
    await touchPreview(tenantId, lead.id, text);
    return { ok: true, message };
  } catch (error) {
    const message = await finish(tenantId, messageId, false);
    return { ok: false, error: friendlyError(error), message };
  }
}

export type MediaKind = 'image' | 'audio' | 'document';

export function mediaKind(mimetype: string): MediaKind {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Arquivo, imagem ou áudio da equipe para o cliente. */
export async function sendMediaToLead(
  tenantId: string,
  senderId: string,
  lead: ChatLead,
  file: { buffer: Buffer; name: string; mimetype: string },
  caption: string
): Promise<SendResult> {
  if (!lead.phone) return { ok: false, error: 'Este contato não tem telefone.' };
  if (file.buffer.length > 16 * 1024 * 1024) return { ok: false, error: 'Arquivo acima de 16 MB (limite do WhatsApp).' };
  const channels = await whatsappChannels(tenantId);
  if (!channels.web && !channels.api) return { ok: false, error: 'Nenhum WhatsApp conectado. Conecte o WhatsApp Web ou a API oficial em Integrações.' };
  const provider = channels.web ? 'whatsapp_web' : 'meta';
  const kind = mediaKind(file.mimetype);

  const safeName = (file.name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const storagePath = `${tenantId}/${lead.id}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabaseAdmin.storage.from('chat-media').upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) return { ok: false, error: `Falha ao guardar o arquivo: ${uploadError.message}` };
  const mediaUrl = supabaseAdmin.storage.from('chat-media').getPublicUrl(storagePath).data.publicUrl;

  const { data: inserted, error } = await insertChatMessage({ tenant_id: tenantId, lead_id: lead.id, text: kind === 'document' ? caption || file.name : caption, type: kind, audio_url: mediaUrl, sent_by_me: true, status: 'sending', provider, sent_by: senderId, origin: 'team' }, 'id');
  if (error || !inserted) return { ok: false, error: error?.message || 'Não foi possível registrar a mensagem.' };
  const row = { id: String(inserted.id) };

  try {
    let externalId: string | null = null;
    if (provider === 'whatsapp_web') {
      const { sendWhatsAppWebMedia } = await import('@/lib/whatsapp-web');
      const sent = await sendWhatsAppWebMedia(tenantId, lead.phone, file.buffer, kind, { caption: caption || undefined, fileName: file.name, mimetype: file.mimetype });
      externalId = sent?.key?.id ?? null;
    } else {
      const { WhatsAppService, getWhatsAppConfig } = await import('@/lib/whatsapp');
      const service = new WhatsAppService(await getWhatsAppConfig(supabaseAdmin, tenantId));
      const result = kind === 'image'
        ? await service.sendImage(lead.phone, mediaUrl, caption || undefined)
        : kind === 'audio'
          ? await service.sendAudio(lead.phone, mediaUrl)
          : await service.sendDocument(lead.phone, mediaUrl, file.name, caption || undefined);
      if (!result.success) throw new Error(result.error || 'A Meta recusou o arquivo.');
      externalId = (result as { messageId?: string }).messageId ?? null;
    }
    const message = await finish(tenantId, row.id, true, externalId);
    await touchPreview(tenantId, lead.id, kind === 'image' ? '📷 Imagem' : kind === 'audio' ? '🎵 Áudio' : `📎 ${file.name}`);
    return { ok: true, message };
  } catch (sendError) {
    const message = await finish(tenantId, row.id, false);
    return { ok: false, error: friendlyError(sendError), message };
  }
}

/** Conversa vista pela equipe: zera as não lidas. */
export async function markLeadRead(tenantId: string, leadId: string) {
  await supabaseAdmin.from('leads').update({ unread_count: 0 }).eq('tenant_id', tenantId).eq('id', leadId);
}
