/**
 * ============================================================
 * VÓRTICE CRM — Processamento do Webhook Meta (WhatsApp Business API)
 * ============================================================
 * Lógica de negócio para eventos recebidos da Meta Cloud API:
 * localizar/criar o lead, salvar a mensagem, marcar como lida,
 * aplicar roteamento de campanha e atualizar status de entrega.
 * A rota em src/app/api/webhooks/meta/route.ts cuida só de validar
 * a assinatura HMAC e despachar para cá.
 * ============================================================
 */

import { WhatsAppService, resolveMetaTenant } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';
import { handleCampaignReply } from '@/services/disparos.service';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { WhatsAppWebhookPayload, WhatsAppInboundMessage, WhatsAppMessageStatus } from '@/types';
import { emitIntegrationEvent, leadEventData } from '@/lib/integrations/events';
import { fireAutomation, onInboundMessage, onLeadCreated } from '@/lib/automations/engine';

/** phone_number_id de todos os eventos do payload (para achar a empresa). */
export function phoneNumberIdsOf(payload: WhatsAppWebhookPayload): string[] {
  const ids = new Set<string>();
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const id = change.value?.metadata?.phone_number_id;
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Processa os eventos de UMA empresa: só os do número que é dela.
 * Leads e mensagens entram com o tenant_id dessa empresa.
 */
export async function processWebhookEntries(
  payload: WhatsAppWebhookPayload,
  service: WhatsAppService,
  tenantId: string,
  phoneNumberId: string
) {
  const supabase = supabaseAdmin;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      if (value.metadata.phone_number_id !== phoneNumberId) continue;

      if (value.messages?.length) {
        for (const message of value.messages) {
          const senderName = value.contacts?.find(c => c.wa_id === message.from)?.profile.name
            ?? 'Cliente WhatsApp';
          await handleInboundMessage(supabase, tenantId, message, senderName, phoneNumberId, service);
        }
      }

      if (value.statuses?.length) {
        for (const status of value.statuses) {
          await handleMessageStatus(supabase, tenantId, status);
        }
      }
    }
  }
}

export { resolveMetaTenant };

// ─────────────────────────────────────────────────────────────
// Processamento de Mensagem Recebida
// ─────────────────────────────────────────────────────────────
async function handleInboundMessage(
  supabase: typeof supabaseAdmin,
  tenantId: string,
  message: WhatsAppInboundMessage,
  senderName: string,
  phoneNumberId: string,
  service: WhatsAppService
) {
  try {
    const cleanPhone = message.from; // já vem com código do país, sem +
    const searchSuffix = cleanPhone.slice(-8);

    // Extrai o texto da mensagem conforme o tipo
    const messageText = extractMessageText(message);
    const messageType = mapMessageType(message.type);
    const wamid = message.id; // WhatsApp Message ID

    // 1. Lead DESTA empresa com o mesmo telefone
    const { data: candidates } = await supabase
      .from('leads')
      .select('id, name, phone')
      .eq('tenant_id', tenantId)
      .ilike('phone', `%${searchSuffix}`)
      .limit(20);
    const targetLead = (candidates || []).find((l: { phone?: string }) =>
      (l.phone || '').replace(/\D/g, '').endsWith(searchSuffix)
    );

    let leadId: string | null = targetLead?.id ?? null;
    let isNewLead = false;

    // 2. Cria novo lead se não existir
    if (!leadId) {
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('position')
        .limit(1);
      const firstStageId = stages?.[0]?.id ?? null;

      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert([{
          tenant_id: tenantId,
          name: senderName,
          phone: cleanPhone,
          stage_id: firstStageId,
          channels: ['whatsapp_meta'],
        }])
        .select()
        .single();

      if (leadError) {
        console.error('[Webhook Meta] Erro ao criar lead:', leadError);
      } else if (newLead) {
        leadId = newLead.id;
        isNewLead = true;
        emitIntegrationEvent(tenantId, 'lead.created', leadEventData(newLead, 'whatsapp'));
        fireAutomation(onLeadCreated, tenantId, String(newLead.id), 'whatsapp');
        await logAudit(
          null,
          'LEAD_CREATE',
          `Lead "${senderName}" criado via WhatsApp Business API (Meta). Phone: ${cleanPhone}`,
          'lead',
          newLead.id,
          supabaseAdmin,
          tenantId
        );
      }
    }

    if (!leadId) {
      console.error('[Webhook Meta] Não foi possível criar/encontrar lead para:', cleanPhone);
      return;
    }

    // 3. Salva a mensagem no banco
    const { error: msgError } = await supabase
      .from('chat_messages')
      .insert([{
        tenant_id: tenantId,
        lead_id: leadId,
        text: messageText,
        sent_by_me: false,
        type: messageType,
        status: 'received',
        external_id: wamid,          // wamid para rastreamento
        provider: 'meta',            // qual API enviou
        phone_number_id: phoneNumberId, // ID do número receptor
        raw_payload: message,        // payload completo para debug
      }]);

    if (msgError) {
      console.error('[Webhook Meta] Erro ao salvar mensagem:', msgError);
    } else {
      emitIntegrationEvent(tenantId, 'message.received', {
        lead_id: leadId,
        lead_name: targetLead?.name || senderName,
        phone: cleanPhone,
        text: messageText || null,
        type: messageType,
        media_url: null,
        received_at: new Date().toISOString(),
      });
    }

    // 4. Atualiza last_msg do lead
    await supabase
      .from('leads')
      .update({
        last_msg: messageText || getMediaLabel(message.type),
        last_activity_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', leadId);

    // Automações depois do last_msg, para a resposta do robô não ser sobrescrita.
    if (!msgError) fireAutomation(onInboundMessage, tenantId, String(leadId), messageText || '', { isNewContact: isNewLead });

    // 5. Marca mensagem como lida (envia duplo-check azul)
    try {
      await service.markAsRead(wamid);
    } catch {
      // Não critico — as env vars podem não estar configuradas ainda
    }

    // 6. Resposta a uma campanha (Disparos): roteamento, etiqueta, automação e pedido para sair
    await handleCampaignReply(tenantId, String(leadId), cleanPhone, messageText || '').catch((error) => console.error('[disparos] resposta', error));

    console.log(`[Webhook Meta] ✅ Mensagem de ${senderName} (${cleanPhone}) processada. Lead: ${leadId} | Novo: ${isNewLead}`);
  } catch (err: unknown) {
    console.error('[Webhook Meta] Erro ao processar mensagem:', err instanceof Error ? err.message : err);
  }
}

// ─────────────────────────────────────────────────────────────
// Processamento de Status de Mensagem
// ─────────────────────────────────────────────────────────────
async function handleMessageStatus(
  supabase: typeof supabaseAdmin,
  tenantId: string,
  status: WhatsAppMessageStatus
) {
  try {
    // Mapeia status Meta → status interno
    const statusMap: Record<string, string> = {
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
      deleted: 'deleted',
    };
    const internalStatus = statusMap[status.status] ?? status.status;

    // Atualiza o status da mensagem pelo wamid (external_id)
    const { error } = await supabase
      .from('chat_messages')
      .update({
        status: internalStatus,
        ...(status.errors?.length ? { error_details: status.errors } : {}),
      })
      .eq('tenant_id', tenantId)
      .eq('external_id', status.id);

    if (error) {
      console.warn('[Webhook Meta] Erro ao atualizar status:', error.message);
    } else {
      console.log(`[Webhook Meta] 📊 Status atualizado: ${status.id} → ${internalStatus}`);
    }
  } catch (err: unknown) {
    console.error('[Webhook Meta] Erro ao processar status:', err instanceof Error ? err.message : err);
  }
}

// ─────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────

/** Extrai o texto legível de qualquer tipo de mensagem */
function extractMessageText(message: WhatsAppInboundMessage): string {
  switch (message.type) {
    case 'text':        return message.text?.body ?? '';
    case 'interactive':
      return message.interactive?.button_reply?.title
        ?? message.interactive?.list_reply?.title
        ?? '[Resposta interativa]';
    case 'button':      return message.button?.text ?? '[Botão]';
    case 'location':
      return message.location
        ? `📍 ${message.location.name ?? 'Localização'} (${message.location.latitude}, ${message.location.longitude})`
        : '📍 Localização';
    default:            return '';
  }
}

/** Mapeia tipo de mensagem Meta → tipo interno */
function mapMessageType(type: WhatsAppInboundMessage['type']): string {
  const map: Partial<Record<WhatsAppInboundMessage['type'], string>> = {
    text: 'text',
    audio: 'audio',
    image: 'image',
    video: 'video',
    document: 'document',
    sticker: 'sticker',
    location: 'location',
    interactive: 'interactive',
    button: 'button',
  };
  return map[type] ?? 'unsupported';
}

/** Rótulo amigável para mensagens sem texto */
function getMediaLabel(type: WhatsAppInboundMessage['type']): string {
  const labels: Partial<Record<WhatsAppInboundMessage['type'], string>> = {
    audio: '🎵 Áudio',
    image: '📷 Imagem',
    video: '🎬 Vídeo',
    document: '📄 Documento',
    sticker: '😄 Figurinha',
    location: '📍 Localização',
    contacts: '👤 Contato',
  };
  return labels[type] ?? '💬 Nova mensagem';
}
