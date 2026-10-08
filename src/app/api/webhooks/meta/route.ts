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
 * TAMBÉM RECEBE (mesma URL, app da Vórtice):
 *   - Direct do Instagram (object "instagram") e Messenger (object "page"),
 *     tratados em src/lib/social/inbox.ts.
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
import { phoneNumberIdsOf, processWebhookEntries, resolveMetaTenant } from '@/services/meta-webhook.service';
import { isKnownVerifyToken } from '@/lib/whatsapp';
import type { WhatsAppWebhookPayload } from '@/types';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isSocialObject, processSocialWebhook, validSocialSignature, type SocialWebhookPayload } from '@/lib/social/inbox';

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

  // Responde somente quando modo = subscribe e o token é de alguma empresa configurada
  if (mode === 'subscribe' && token && challenge) {
    try {
      if (await isKnownVerifyToken(supabaseAdmin, token)) {
        console.log('[Webhook Meta] ✅ Verificação do webhook aprovada.');
        return new NextResponse(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    } catch (err: unknown) {
      console.error('[Webhook Meta] Erro ao verificar token:', err instanceof Error ? err.message : err);
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

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
  }

  // Direct do Instagram e Messenger: vêm do app da Vórtice (Redes Sociais).
  const object: unknown = (payload as { object?: unknown }).object;
  if (isSocialObject(object)) {
    if (!(await validSocialSignature(rawBody, signature))) {
      console.warn('[Webhook Meta] ❌ Assinatura inválida (Instagram/Messenger).');
      return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
    }
    // A Meta espera 200 em até 20s: processa em segundo plano.
    processSocialWebhook(payload as unknown as SocialWebhookPayload).catch((err) => console.error('[Webhook Meta] Erro no processamento (Instagram/Messenger):', err));
    return NextResponse.json({ success: true }, { status: 200 });
  }

  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ error: 'Objeto não reconhecido.' }, { status: 400 });
  }

  // 2. Para cada número que recebeu eventos: acha a empresa dona, valida a
  //    assinatura com a chave DELA e processa só os eventos desse número.
  //    Número sem empresa dona = evento ignorado (nunca cai em outra empresa).
  for (const phoneNumberId of phoneNumberIdsOf(payload)) {
    const owner = await resolveMetaTenant(supabaseAdmin, phoneNumberId);
    if (!owner) {
      console.warn('[Webhook Meta] Número sem empresa configurada, evento ignorado:', phoneNumberId);
      continue;
    }

    const service = new WhatsAppService(owner.config);
    if (!service.validateWebhookSignature(rawBody, signature)) {
      console.warn('[Webhook Meta] ❌ Assinatura HMAC inválida para o número', phoneNumberId);
      return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
    }

    // A Meta espera 200 em até 20s: processa em segundo plano.
    processWebhookEntries(payload, service, owner.tenantId, phoneNumberId).catch(err =>
      console.error('[Webhook Meta] Erro no processamento:', err)
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
