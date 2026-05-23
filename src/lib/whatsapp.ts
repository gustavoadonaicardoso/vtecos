/**
 * ============================================================
 * VTEC OS — WhatsApp Business Cloud API Service (Meta)
 * ============================================================
 * Documentação oficial:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Variáveis de ambiente necessárias (.env.local):
 *   WHATSAPP_ACCESS_TOKEN        — Token do System User (permanente)
 *   WHATSAPP_PHONE_NUMBER_ID     — ID do número de telefone no WABA
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — WABA ID
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN— Token de verificação do webhook
 *   WHATSAPP_APP_SECRET          — App Secret para HMAC-SHA256
 * ============================================================
 */

import { createHmac } from 'crypto';
import type {
  MetaWhatsAppConfig,
  WhatsAppMessagePayload,
  WhatsAppWebhookPayload,
  WhatsAppInboundMessage,
  WhatsAppMessageStatus,
} from '@/types';

export type {
  MetaWhatsAppConfig,
  WhatsAppMessagePayload,
  WhatsAppWebhookPayload,
  WhatsAppInboundMessage,
  WhatsAppMessageStatus,
};

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// ─── Helpers de configuração ──────────────────────────────────

/**
 * Retorna a configuração da Meta API a partir das variáveis de ambiente.
 * Lança erro descritivo se alguma variável obrigatória estiver ausente.
 */
export function getMetaConfig(): MetaWhatsAppConfig {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  const missing: string[] = [];
  if (!accessToken)        missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!phoneNumberId)      missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!businessAccountId)  missing.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
  if (!webhookVerifyToken) missing.push('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  if (!appSecret)          missing.push('WHATSAPP_APP_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Configuração WhatsApp incompleta. Variáveis faltando no .env.local: ${missing.join(', ')}\n` +
      'Consulte WHATSAPP_API_DOCS.md para instruções de configuração.'
    );
  }

  return {
    accessToken: accessToken!,
    phoneNumberId: phoneNumberId!,
    businessAccountId: businessAccountId!,
    webhookVerifyToken: webhookVerifyToken!,
    appSecret: appSecret!,
    apiVersion: API_VERSION,
  };
}

/**
 * Normaliza número de telefone para o formato esperado pela Meta API.
 * Formato esperado: apenas dígitos, com código do país (ex: 5511999887766)
 */
export function normalizePhone(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  // Se não começar com 55 (Brasil), adiciona
  if (!clean.startsWith('55') && clean.length <= 11) {
    clean = '55' + clean;
  }
  return clean;
}

// ─── WhatsAppService — Serviço principal ──────────────────────

export class WhatsAppService {
  private config: MetaWhatsAppConfig;

  constructor(config?: MetaWhatsAppConfig) {
    this.config = config ?? getMetaConfig();
  }

  private get baseUrl() {
    return `https://graph.facebook.com/${this.config.apiVersion ?? API_VERSION}`;
  }

  private get headers(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private get sendUrl(): string {
    return `${this.baseUrl}/${this.config.phoneNumberId}/messages`;
  }

  // ─── Envio de mensagens ──────────────────────────────────────

  /**
   * Envia mensagem de texto simples.
   *
   * @example
   * await service.sendText('5511999887766', 'Olá! Como posso ajudar?')
   */
  async sendText(
    phone: string,
    text: string,
    options?: { previewUrl?: boolean }
  ) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'text',
      text: { body: text, preview_url: options?.previewUrl ?? false },
    };
    return this._send(payload);
  }

  /**
   * Envia mensagem via template HSM aprovado.
   * Use para mensagens fora da janela de 24h (marketing, notificações, alertas).
   *
   * @example
   * await service.sendTemplate('5511999887766', 'boas_vindas', 'pt_BR', [
   *   { type: 'body', parameters: [{ type: 'text', text: 'João' }] }
   * ])
   */
  async sendTemplate(
    phone: string,
    templateName: string,
    languageCode: string = 'pt_BR',
    components?: NonNullable<WhatsAppMessagePayload['template']>['components']
  ) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    };
    return this._send(payload);
  }

  /**
   * Envia imagem (por URL pública).
   *
   * @example
   * await service.sendImage('5511999887766', 'https://exemplo.com/img.jpg', 'Confira nossa oferta!')
   */
  async sendImage(phone: string, imageUrl: string, caption?: string) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    };
    return this._send(payload);
  }

  /**
   * Envia vídeo (por URL pública).
   */
  async sendVideo(phone: string, videoUrl: string, caption?: string) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'video',
      video: { link: videoUrl, ...(caption ? { caption } : {}) },
    };
    return this._send(payload);
  }

  /**
   * Envia documento/arquivo (por URL pública).
   *
   * @example
   * await service.sendDocument('5511999887766', 'https://exemplo.com/doc.pdf', 'Contrato.pdf', 'Segue o contrato.')
   */
  async sendDocument(phone: string, docUrl: string, filename: string, caption?: string) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'document',
      document: { link: docUrl, filename, ...(caption ? { caption } : {}) },
    };
    return this._send(payload);
  }

  /**
   * Envia áudio (por URL pública — deve ser MP3 ou OGG/Opus).
   */
  async sendAudio(phone: string, audioUrl: string) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'audio',
      audio: { link: audioUrl },
    };
    return this._send(payload);
  }

  /**
   * Envia mensagem com botões de resposta rápida (até 3 botões).
   *
   * @example
   * await service.sendButtons('5511999887766', 'Deseja continuar?', [
   *   { id: 'sim', title: 'Sim' },
   *   { id: 'nao', title: 'Não' },
   * ])
   */
  async sendButtons(
    phone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    options?: { header?: string; footer?: string }
  ) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(options?.header ? { header: { type: 'text', text: options.header } } : {}),
        body: { text: bodyText },
        ...(options?.footer ? { footer: { text: options.footer } } : {}),
        action: {
          buttons: buttons.map(b => ({
            type: 'reply' as const,
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };
    return this._send(payload);
  }

  /**
   * Envia lista interativa com seções e itens.
   *
   * @example
   * await service.sendList('5511999887766', 'Escolha uma opção', 'Ver opções', [
   *   { title: 'Suporte', rows: [{ id: 'tecnico', title: 'Suporte Técnico' }] }
   * ])
   */
  async sendList(
    phone: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    options?: { header?: string; footer?: string }
  ) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(options?.header ? { header: { type: 'text', text: options.header } } : {}),
        body: { text: bodyText },
        ...(options?.footer ? { footer: { text: options.footer } } : {}),
        action: { button: buttonLabel, sections },
      },
    };
    return this._send(payload);
  }

  /**
   * Envia reação emoji a uma mensagem específica.
   */
  async sendReaction(phone: string, messageId: string, emoji: string) {
    const payload: WhatsAppMessagePayload = {
      to: normalizePhone(phone),
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    };
    return this._send(payload);
  }

  /**
   * Marca uma mensagem recebida como lida.
   * Isso exibe o duplo-check azul no WhatsApp do cliente.
   *
   * @param messageId — ID da mensagem (wamid) recebida no webhook
   */
  async markAsRead(messageId: string) {
    try {
      const response = await fetch(this.sendUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        console.warn('markAsRead failed:', err);
        return { success: false, error: err.error?.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ─── Validação de Webhook ────────────────────────────────────

  /**
   * Valida a assinatura HMAC-SHA256 do payload recebido no webhook.
   *
   * A Meta envia o header `X-Hub-Signature-256: sha256=<hash>`.
   * Esse método computa o hash esperado e compara de forma segura.
   *
   * @param rawBody  — corpo bruto da requisição (Buffer ou string)
   * @param signature — valor do header X-Hub-Signature-256
   * @returns true se a assinatura for válida
   */
  validateWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature?.startsWith('sha256=')) return false;
    const receivedHash = signature.slice(7); // Remove "sha256="
    const expectedHash = createHmac('sha256', this.config.appSecret)
      .update(rawBody)
      .digest('hex');
    // Comparação em tempo constante para evitar timing attacks
    return receivedHash.length === expectedHash.length &&
      createHmac('sha256', 'timing-safe')
        .update(receivedHash)
        .digest('hex') ===
      createHmac('sha256', 'timing-safe')
        .update(expectedHash)
        .digest('hex');
  }

  /**
   * Verifica o Verify Token no handshake GET do webhook.
   * @returns true se o token bater com WHATSAPP_WEBHOOK_VERIFY_TOKEN
   */
  verifyWebhookToken(token: string): boolean {
    return token === this.config.webhookVerifyToken;
  }

  // ─── Recuperação de mídia ────────────────────────────────────

  /**
   * Obtém a URL de download de uma mídia recebida via webhook.
   * Use o media ID retornado em `WhatsAppInboundMessage.audio.id`, etc.
   *
   * @example
   * const { url } = await service.getMediaUrl(msg.audio.id)
   * // Faça download da URL com o header Authorization: Bearer <token>
   */
  async getMediaUrl(mediaId: string): Promise<{ url?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/${mediaId}`, {
        headers: this.headers,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message);
      return { url: data.url };
    } catch (err: any) {
      return { error: err.message };
    }
  }

  /**
   * Valida a conexão fazendo uma requisição simples ao Phone Number ID.
   * Útil para testar se o token e o phone ID estão corretos.
   *
   * @returns true se a conexão for bem-sucedida
   */
  async validateConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/${this.config.phoneNumberId}?fields=display_phone_number,verified_name`,
        { headers: this.headers }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Método estático de compatibilidade com a interface antiga.
   * Usado por integrations/page.tsx que chama WhatsAppService.validateConnection({ token, phoneId }).
   *
   * @deprecated Prefira instanciar WhatsAppService e usar validateConnection() de instância.
   */
  static async validateConnection(config: { token: string; phoneId: string }): Promise<boolean> {
    const apiVersion = 'v21.0';
    const url = `https://graph.facebook.com/${apiVersion}/${config.phoneId}?fields=display_phone_number,verified_name`;
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${config.token}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─── Método interno de envio ──────────────────────────────────

  private async _send(payload: WhatsAppMessagePayload) {
    try {
      const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        type: payload.type,
        // Spreads apenas o campo correspondente ao tipo
        ...(payload.type === 'text' && payload.text ? { text: payload.text } : {}),
        ...(payload.type === 'template' && payload.template ? { template: payload.template } : {}),
        ...(payload.type === 'image' && payload.image ? { image: payload.image } : {}),
        ...(payload.type === 'video' && payload.video ? { video: payload.video } : {}),
        ...(payload.type === 'audio' && payload.audio ? { audio: payload.audio } : {}),
        ...(payload.type === 'document' && payload.document ? { document: payload.document } : {}),
        ...(payload.type === 'interactive' && payload.interactive ? { interactive: payload.interactive } : {}),
        ...(payload.type === 'reaction' && payload.reaction ? { reaction: payload.reaction } : {}),
        ...(payload.type === 'location' && payload.location ? { location: payload.location } : {}),
      };

      const response = await fetch(this.sendUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.error?.message || `HTTP ${response.status}`;
        console.error('WhatsApp API Error:', data);
        return { success: false, error: errMsg, data };
      }

      // data.messages[0].id = wamid da mensagem enviada
      return { success: true, data, messageId: data.messages?.[0]?.id };
    } catch (err: any) {
      console.error('WhatsAppService._send error:', err);
      return { success: false, error: err.message };
    }
  }
}

// ─── Instância singleton (usa env vars) ──────────────────────

/**
 * Instância pronta para uso no lado servidor.
 * Lazy-initialized para evitar erros em build time.
 */
let _serviceInstance: WhatsAppService | null = null;

export function getWhatsAppService(): WhatsAppService {
  if (!_serviceInstance) {
    _serviceInstance = new WhatsAppService(getMetaConfig());
  }
  return _serviceInstance;
}
