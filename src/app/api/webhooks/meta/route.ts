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
 *
 * O processamento de negócio (localizar/criar lead, salvar mensagem,
 * roteamento de campanha etc.) vive em
 * src/services/meta-webhook.service.ts — esta rota só valida a
 * requisição e despacha.
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppService } from '@/lib/whatsapp';
import { getService, processWebhookEntries } from '@/services/meta-webhook.service';
import type { WhatsAppWebhookPayload } from '@/types';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
      const service = await getService(supabaseAdmin);
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

  let service: WhatsAppService | null = null;

  // 2. Valida assinatura HMAC-SHA256 (segurança)
  try {
    service = await getService(supabaseAdmin);
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
