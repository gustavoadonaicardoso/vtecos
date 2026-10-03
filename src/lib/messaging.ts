import { supabase } from './supabase';
import { logAudit } from './audit';

/**
 * Persists a chat message to the database
 */
export async function saveChatMessage(params: {
  leadId: string;
  text: string;
  sentByMe: boolean;
  type?: 'text' | 'audio';
  audioUrl?: string;
  status?: 'sending' | 'sent' | 'failed';
}): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('chat_messages')
    .insert([{
      lead_id: params.leadId,
      text: params.text,
      sent_by_me: params.sentByMe,
      type: params.type || 'text',
      audio_url: params.audioUrl || null,
      status: params.status || 'sent',
    }])
    .select('id')
    .single();

  if (error) {
    console.error('saveChatMessage error:', error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Envia uma mensagem pelo conector gratuito do WhatsApp Web.
 * O nome da função foi mantido para preservar compatibilidade com as telas existentes.
 */
export async function sendWhatsApp(
  phone: string,
  message: string,
  leadId?: string,
  options?: { delayMessage?: number; delayTyping?: number }
) {
  if (!supabase) return { success: false, error: 'Supabase não inicializado' };

  try {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) return { success: false, error: 'Número de telefone inválido' };

    if (!cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }

    // 1. Save to DB with 'sending' status BEFORE hitting the API
    let dbMessageId: string | null = null;
    if (leadId) {
      dbMessageId = await saveChatMessage({
        leadId,
        text: message,
        sentByMe: true,
        type: 'text',
        status: 'sending',
      });
    }

    // 2. Call the self-hosted WhatsApp Web route
    const response = await fetch('/api/whatsapp/web/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, message }),
    });

    const result = await response.json();

    // 3. Update status in DB
    if (dbMessageId && supabase) {
      await supabase
        .from('chat_messages')
        .update({ status: response.ok ? 'sent' : 'failed' })
        .eq('id', dbMessageId);
    }

    return { success: response.ok, data: result, dbMessageId, error: result.error };

  } catch (err: any) {
    console.error('WhatsApp Web Send Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * When a lead replies, check if their phone was part of a blast campaign that has
 * route_type configured. If so, assign the lead to the specified user or move to
 * the specified pipeline stage so the right person/team sees the conversation.
 *
 * Só campanhas DA MESMA EMPRESA do lead são consideradas.
 */
export async function applyBlastRouting(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    cleanPhone: string,
    searchSuffix: string,
    leadId: string,
    tenantId: string
) {
    try {
        const { data: contacts } = await db
            .from('blast_contacts')
            .select('campaign_id')
            .eq('tenant_id', tenantId)
            .or(`phone.eq.${cleanPhone},phone.ilike.%${searchSuffix}`)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!contacts?.length) return;

        const campaignIds = contacts.map((c: { campaign_id: string }) => c.campaign_id);
        const { data: campaigns } = await db
            .from('blast_campaigns')
            .select('id, route_type, route_to_id')
            .eq('tenant_id', tenantId)
            .in('id', campaignIds)
            .neq('route_type', 'none')
            .not('route_to_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1);

        const campaign = campaigns?.[0];
        if (!campaign) return;

        if (campaign.route_type === 'user') {
            await db
                .from('leads')
                .update({ assigned_to: campaign.route_to_id })
                .eq('tenant_id', tenantId)
                .eq('id', leadId);
        } else if (campaign.route_type === 'stage') {
            await db
                .from('leads')
                .update({ stage_id: campaign.route_to_id })
                .eq('tenant_id', tenantId)
                .eq('id', leadId);
        }
    } catch (err) {
        console.error('applyBlastRouting error:', err);
    }
}

/**
 * Processa uma mensagem de WhatsApp recebida (cria/atualiza lead, salva a
 * mensagem, aplica roteamento de campanha). Usado pelo listener do WhatsApp
 * Web (src/lib/whatsapp-web.ts) sempre que chega uma mensagem nova.
 *
 * Roda no servidor com o client administrativo, então TUDO filtra pela
 * empresa dona do número que recebeu a mensagem (tenantId).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processInboundWhatsAppMessage(payload: any, db: any, tenantId: string) {
    if (!db || !tenantId) return { success: false, error: 'Empresa não identificada.' };

    try {
        const rawPhone = payload.phone || '';
        const cleanPhone = rawPhone.replace(/\D/g, '');

        // Busca pelos últimos dígitos para não depender do formato salvo no lead.
        const searchSuffix = cleanPhone.slice(-8);

        const isReceivedMessage = payload.isGroup === false;
        const media = payload.media as { url: string; kind: 'image' | 'audio' | 'document' } | undefined;

        if (isReceivedMessage && (payload.text?.message || payload.audio?.audioUrl || media) && searchSuffix.length >= 8) {
            const senderName = payload.senderName || 'Cliente WhatsApp';
            const messageText = payload.text?.message || '';
            const mediaUrl = media?.url || payload.audio?.audioUrl || null;
            const messageType = media?.kind || (mediaUrl ? 'audio' : 'text');

            // 1. Lead desta empresa com o mesmo telefone
            const { data: candidates } = await db
                .from('leads')
                .select('id, name, phone')
                .eq('tenant_id', tenantId)
                .ilike('phone', `%${searchSuffix}`)
                .limit(20);
            const targetLead = (candidates || []).find((l: { phone?: string }) =>
                (l.phone || '').replace(/\D/g, '').endsWith(searchSuffix));

            let leadId = targetLead?.id;

            if (!leadId) {
                // 2. Lead novo, na primeira etapa do funil DESTA empresa
                const { data: stages } = await db.from('pipeline_stages').select('id').eq('tenant_id', tenantId).order('position').limit(1);
                const firstStageId = stages && stages.length > 0 ? stages[0].id : null;

                const { data: newLead } = await db.from('leads').insert([{
                    tenant_id: tenantId,
                    name: senderName,
                    phone: cleanPhone,
                    stage_id: firstStageId
                }]).select().single();

                if (newLead) {
                    leadId = newLead.id;
                    await logAudit(null, 'LEAD_CREATE', `Lead ${senderName} criado via WhatsApp.`, 'lead', newLead.id, db, tenantId);
                }
            }

            if (leadId) {
                // 3. Mensagem
                await db.from('chat_messages').insert([{
                    tenant_id: tenantId,
                    lead_id: leadId.toString(),
                    text: messageText,
                    audio_url: mediaUrl,
                    sent_by_me: false,
                    type: messageType
                }]);

                // 4. Última mensagem do lead
                const lastMsgPreview = messageText
                    || (messageType === 'audio' ? '🎵 Áudio'
                        : messageType === 'image' ? '📷 Imagem'
                        : messageType === 'document' ? '📎 Arquivo'
                        : 'Nova mensagem');
                await db.from('leads').update({
                    last_msg: lastMsgPreview
                }).eq('tenant_id', tenantId).eq('id', leadId);

                // 5. Roteamento de campanha (disparos) da mesma empresa
                await applyBlastRouting(db, cleanPhone, searchSuffix, leadId, tenantId);
            }
        }

        return { success: true };
    } catch (error: unknown) {
        console.error('Inbound WhatsApp message processing error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Erro.' };
    }
}
