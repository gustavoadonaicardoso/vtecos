import { logAudit } from './audit';

// O envio da equipe para o cliente é feito no servidor
// (src/services/conversations.service.ts, rotas /api/messages/*).

/**
 * Avisos para as integrações de saída (webhooks, Google Sheets). Quem chama
 * (servidor) passa o emissor -- este arquivo também é importado pela tela
 * de Mensagens, então não pode importar nada exclusivo do servidor.
 */
export interface InboundEventSink {
    leadCreated?: (lead: Record<string, unknown>) => void;
    messageReceived?: (data: Record<string, unknown>) => void;
}

/**
 * Processa uma mensagem de WhatsApp recebida (cria/atualiza lead, salva a
 * mensagem, avisa integrações, automações e Disparos). Usado pelo listener do WhatsApp
 * Web (src/lib/whatsapp-web.ts) sempre que chega uma mensagem nova.
 *
 * Roda no servidor com o client administrativo, então TUDO filtra pela
 * empresa dona do número que recebeu a mensagem (tenantId).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processInboundWhatsAppMessage(payload: any, db: any, tenantId: string, events: InboundEventSink = {}) {
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
                    events.leadCreated?.(newLead);
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

                // 5. Webhooks da empresa (Integrações)
                events.messageReceived?.({
                    lead_id: String(leadId),
                    lead_name: targetLead?.name || senderName,
                    phone: cleanPhone,
                    text: messageText || null,
                    type: messageType,
                    media_url: mediaUrl || null,
                    received_at: new Date().toISOString(),
                });
            }
        }

        return { success: true };
    } catch (error: unknown) {
        console.error('Inbound WhatsApp message processing error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Erro.' };
    }
}
