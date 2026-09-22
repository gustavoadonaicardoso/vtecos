// ─── Integrações — WhatsApp Business Cloud API (Meta) ─────────

/** Configuração completa da Meta Cloud API */
export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  appSecret?: string;
  apiVersion?: string; // default: v21.0
}

/** Payload de mensagem de saída — suporta todos os tipos Meta */
export interface WhatsAppMessagePayload {
  to: string;
  type: 'text' | 'template' | 'image' | 'video' | 'audio' | 'document' | 'interactive' | 'reaction' | 'location';
  text?: { body: string; preview_url?: boolean };
  template?: {
    name: string;
    language: { code: string };
    components?: WhatsAppTemplateComponent[];
  };
  image?: { link: string; caption?: string };
  video?: { link: string; caption?: string };
  audio?: { link: string };
  document?: { link: string; caption?: string; filename?: string };
  interactive?: WhatsAppInteractiveMessage;
  reaction?: { message_id: string; emoji: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: number;
  parameters: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
    text?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
    date_time?: { fallback_value: string };
    image?: { link: string };
    document?: { link: string; filename: string };
  }>;
}

export interface WhatsAppInteractiveMessage {
  type: 'button' | 'list' | 'product' | 'product_list';
  header?: { type: 'text' | 'image' | 'video' | 'document'; text?: string; image?: { link: string } };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
    button?: string;
    sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  };
}

// ─── Webhook Meta — Payload de entrada ────────────────────────

/** Estrutura completa do payload POST enviado pela Meta ao webhook */
export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string; // WABA ID
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookValue;
  field: 'messages';
}

export interface WhatsAppWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: { name: string };
    wa_id: string;
  }>;
  messages?: WhatsAppInboundMessage[];
  statuses?: WhatsAppMessageStatus[];
  errors?: WhatsAppWebhookError[];
}

/** Mensagem recebida via webhook */
export interface WhatsAppInboundMessage {
  id: string;               // ID da mensagem (wamid)
  from: string;             // Número do remetente (com código país, sem +)
  timestamp: string;        // Unix timestamp
  type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'order' | 'unsupported';
  text?: { body: string };
  audio?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string; sha256: string };
  video?: { id: string; mime_type: string; caption?: string; sha256: string };
  document?: { id: string; filename: string; mime_type: string; caption?: string; sha256: string };
  sticker?: { id: string; mime_type: string; animated: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { payload: string; text: string };
  context?: { from: string; id: string }; // Se for reply a outra msg
  errors?: WhatsAppWebhookError[];
}

/** Atualização de status de mensagem enviada */
export interface WhatsAppMessageStatus {
  id: string;           // wamid da mensagem enviada
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: { type: 'business_initiated' | 'customer_initiated' | 'referral_conversion' };
    expiration_timestamp?: string;
  };
  pricing?: { pricing_model: string; billable: boolean; category: string };
  errors?: WhatsAppWebhookError[];
}

export interface WhatsAppWebhookError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

// ─── Integrações — Meta Messaging (Instagram/Messenger) ───────

export interface MetaMessagePayload {
  recipientId: string;
  message: {
    text?: string;
    attachment?: {
      type: 'image' | 'video' | 'audio' | 'file' | 'template';
      payload: any;
    };
  };
  platform: 'messenger' | 'instagram';
}
