/**
 * ============================================================
 * VTEC OS — Meta WhatsApp Business API Webhook
 * ============================================================
 *
 * CONFIGURAÇÃO NO META:
 *   1. Acesse: https://developers.facebook.com/apps
 *   2. Selecione seu App > WhatsApp > Configuração
 *   3. Em "Webhooks", clique em "Configurar"
 *   4. URL de callback: https://SEU_DOMINIO/api/webhooks/meta
 *   5. Verify Token: mesmo valor de WHATSAPP_WEBHOOK_VERIFY_TOKEN
 *   6. Campos a assinar: messages, message_status_updates
 *
 * SEGURANÇA:
 *   - Verificação de assinatura HMAC-SHA256 via X-Hub-Signature-256
 *   - Verificação de Verify Token no handshake GET
 *   - Resposta 200 imediata (a Meta requer resposta em < 20s)
 *
 * EVENTOS TRATADOS:
 *   - Mensagem de texto recebida
 *   - Áudio recebido
 *   - Imagem/vídeo/documento recebido
 *   - Mensagem interativa (botão / lista)
 *   - Atualização de status (sent, delivered, read, failed)
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppService, getWhatsAppConfig } from '@/lib/whatsapp';
import { logAudit } from '@/lib/audit';
import type { WhatsAppWebhookPayload, WhatsAppInboundMessage, WhatsAppMessageStatus } from '@/types';

// ─── Admin Supabase client (bypassa RLS) ──────────────────────
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Instância do serviço WhatsApp ───────────────────────────
async function getService(supabaseClient?: any) {
  const config = await getWhatsAppConfig(supabaseClient);
  return new WhatsAppService(config);
}

// ─────────────────────────────────────────────────────────────
// GET — Verificação/Handshake do Webhook (Meta Challenge)
// ─────────────────────────────────────────────────────────────
/**
 * A Meta faz uma requisição GET ao registrar o webhook.
 * Devemos responder com hub.challenge se hub.verify_token bater com o nosso token.
 *
 * Query params enviados pela Meta:
 *   hub.mode        = "subscribe"
 *   hub.verify_token= <valor configurado no Meta App>
 *   hub.challenge   = <número aleatório que devemos retornar>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Responde somente quando modo = subscribe e token correto
  if (mode === 'subscribe' && token) {
    try {
      const supabase = getSupabase();
      const service = await getService(supabase);
      if (service.verifyWebhookToken(token) && challenge) {
        console.log('[Webhook Meta] ✅ Verificação do webhook aprovada.');
        // Retorna o challenge como plain text (obrigatório)
        return new NextResponse(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch (err: any) {
      console.error('[Webhook Meta] Erro ao verificar token:', err.message);
    }
  }

  console.warn('[Webhook Meta] ❌ Falha na verificação do webhook. Token inválido ou modo incorreto.');
  return NextResponse.json({ error: 'Verificação do webhook falhou.' }, { status: 403 });
}

// ─────────────────────────────────────────────────────────────
// POST — Recebimento de Eventos (Mensagens e Status)
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // 1. Lê o corpo RAW (necessário para validar assinatura HMAC)
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';

  const supabase = getSupabase();
  let service: WhatsAppService | null = null;

  // 2. Valida assinatura HMAC-SHA256 (segurança)
  try {
    service = await getService(supabase);
    if (!service.validateWebhookSignature(rawBody, signature)) {
      console.warn('[Webhook Meta] ❌ Assinatura HMAC inválida. Requisição rejeitada.');
      return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
    }
  } catch (err: any) {
    // Se as env vars não estiverem configuradas, loga mas não bloqueia
    // em ambiente de desenvolvimento/testes
    if (process.env.NODE_ENV === 'production') {
      console.error('[Webhook Meta] Erro na validação HMAC ou de configuração:', err.message);
      return NextResponse.json({ error: 'Configuração incompleta.' }, { status: 500 });
    }
    console.warn('[Webhook Meta] ⚠️ Validação HMAC ignorada (modo desenvolvimento):', err.message);
  }

  // 3. Parse do payload
  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  // 4. Verifica que é um evento do WhatsApp Business
  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ error: 'Objeto não reconhecido.' }, { status: 400 });
  }

  // 5. Processa cada entry de forma assíncrona (não bloqueia a resposta)
  // A Meta espera resposta HTTP 200 em até 20 segundos.
  // Disparamos o processamento e retornamos 200 imediatamente.
  const finalService = service || new WhatsAppService({
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookVerifyToken: 'vortice_verify_token_2024',
    appSecret: ''
  });

  processWebhookEntries(payload, finalService).catch(err =>
    console.error('[Webhook Meta] Erro no processamento:', err)
  );

  return NextResponse.json({ success: true }, { status: 200 });
}

// ─────────────────────────────────────────────────────────────
// Processamento de Entries
// ─────────────────────────────────────────────────────────────
async function processWebhookEntries(payload: WhatsAppWebhookPayload, service: WhatsAppService) {
  const supabase = getSupabase();

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const phoneNumberId = value.metadata.phone_number_id;

      // Processa mensagens recebidas
      if (value.messages?.length) {
        for (const message of value.messages) {
          const senderName = value.contacts?.find(c => c.wa_id === message.from)?.profile.name
            ?? 'Cliente WhatsApp';
          await handleInboundMessage(supabase, message, senderName, phoneNumberId, service);
        }
      }

      // Processa atualizações de status de mensagens enviadas
      if (value.statuses?.length) {
        for (const status of value.statuses) {
          await handleMessageStatus(supabase, status);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Processamento de Mensagem Recebida
// ─────────────────────────────────────────────────────────────
async function handleInboundMessage(
  supabase: ReturnType<typeof getSupabase>,
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

    // 1. Busca lead existente pelo telefone
    let targetLead: any = null;

    // Tentativa via RPC (se definida no Supabase)
    const { data: rpcLead } = await supabase
      .rpc('find_lead_by_phone', { search_phone: cleanPhone })
      .maybeSingle();
    targetLead = rpcLead;

    // Fallback: busca por sufixo do telefone
    if (!targetLead) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, name, phone');
      targetLead = leads?.find((l: any) =>
        l.phone.replace(/\D/g, '').endsWith(searchSuffix)
      );
    }

    let leadId: string | null = targetLead?.id ?? null;
    let isNewLead = false;

    // 2. Cria novo lead se não existir
    if (!leadId) {
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .order('position')
        .limit(1);
      const firstStageId = stages?.[0]?.id ?? null;

      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert([{
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
        await logAudit(
          null,
          'LEAD_CREATE',
          `Lead "${senderName}" criado via WhatsApp Business API (Meta). Phone: ${cleanPhone}`,
          'lead',
          newLead.id
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
    }

    // 4. Atualiza last_msg do lead
    await supabase
      .from('leads')
      .update({
        last_msg: messageText || getMediaLabel(message.type),
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // 5. Marca mensagem como lida (envia duplo-check azul)
    try {
      await service.markAsRead(wamid);
    } catch {
      // Não critico — as env vars podem não estar configuradas ainda
    }

    // 6. Aplica roteamento de campanha blast (se houver)
    await applyBlastRouting(supabase, cleanPhone, searchSuffix, leadId);

    console.log(`[Webhook Meta] ✅ Mensagem de ${senderName} (${cleanPhone}) processada. Lead: ${leadId} | Novo: ${isNewLead}`);
  } catch (err: any) {
    console.error('[Webhook Meta] Erro ao processar mensagem:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Processamento de Status de Mensagem
// ─────────────────────────────────────────────────────────────
async function handleMessageStatus(
  supabase: ReturnType<typeof getSupabase>,
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
      .eq('external_id', status.id);

    if (error) {
      console.warn('[Webhook Meta] Erro ao atualizar status:', error.message);
    } else {
      console.log(`[Webhook Meta] 📊 Status atualizado: ${status.id} → ${internalStatus}`);
    }
  } catch (err: any) {
    console.error('[Webhook Meta] Erro ao processar status:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Roteamento de Campanha Blast
// ─────────────────────────────────────────────────────────────
async function applyBlastRouting(
  supabase: ReturnType<typeof getSupabase>,
  cleanPhone: string,
  searchSuffix: string,
  leadId: string
) {
  try {
    const { data: contacts } = await supabase
      .from('blast_contacts')
      .select('campaign_id')
      .or(`phone.eq.${cleanPhone},phone.ilike.%${searchSuffix}`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!contacts?.length) return;

    const campaignIds = contacts.map((c: any) => c.campaign_id);
    const { data: campaigns } = await supabase
      .from('blast_campaigns')
      .select('id, route_type, route_to_id')
      .in('id', campaignIds)
      .neq('route_type', 'none')
      .not('route_to_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const campaign = campaigns?.[0];
    if (!campaign) return;

    if (campaign.route_type === 'user') {
      await supabase.from('leads').update({ assigned_to: campaign.route_to_id }).eq('id', leadId);
    } else if (campaign.route_type === 'stage') {
      await supabase.from('leads').update({ stage_id: campaign.route_to_id }).eq('id', leadId);
    }
  } catch (err) {
    console.error('[Webhook Meta] applyBlastRouting error:', err);
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
