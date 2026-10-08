/**
 * ============================================================
 * VTEC OS — Envio de WhatsApp pelo servidor (automações e disparos)
 * ============================================================
 * Escolhe o canal da empresa (WhatsApp Web conectado ou API oficial da
 * Meta), envia texto, arquivo, menu ou template aprovado e registra a
 * mensagem na conversa do lead (aparece em Mensagens).
 * Server-only.
 * ============================================================
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { assertPublicHttpsUrl } from '@/lib/integrations/safe-url';
import { insertChatMessage, type MessageOrigin } from '@/lib/chat-messages';

export type MediaKind = 'image' | 'document' | 'audio' | 'video';

export type WhatsAppPayload = {
  text?: string;
  mediaUrl?: string;
  mediaKind?: MediaKind;
  caption?: string;
  fileName?: string;
  typingSeconds?: number;
  /** Menu com botões/lista (só na API oficial; no WhatsApp Web vai como texto numerado). */
  menu?: { body: string; buttonLabel: string; options: { id: string; title: string }[] };
  /** Template aprovado pela Meta (só na API oficial). `preview` é o texto que fica na conversa. */
  template?: { name: string; language: string; params: string[]; preview: string };
};

export type Channel = 'web' | 'api';

/** Erro de canal (desconectado, sem configuração): quem chama pode pausar em vez de tentar o próximo. */
export class ChannelError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const withOptions = (menu: NonNullable<WhatsAppPayload['menu']>) => `${menu.body}\n\n${menu.options.map((option, index) => `${index + 1}. ${option.title}`).join('\n')}`.trim();

/** Canais conectados da empresa. */
export async function availableChannels(tenantId: string) {
  const { getWhatsAppWebStatus } = await import('@/lib/whatsapp-web');
  const { data } = await supabaseAdmin.from('integrations_config').select('provider').eq('tenant_id', tenantId).eq('provider', 'whatsapp_meta').maybeSingle();
  return { web: getWhatsAppWebStatus(tenantId).connected, api: Boolean(data) };
}

/**
 * Envia pelo WhatsApp da empresa. Sem `channel`: WhatsApp Web conectado tem
 * prioridade; senão, a API oficial da Meta.
 */
export async function deliverWhatsApp(tenantId: string, phone: string, payload: WhatsAppPayload, channel?: Channel): Promise<{ provider: string; text: string }> {
  if (!phone) throw new Error('O contato não tem telefone.');
  const { getWhatsAppWebStatus, sendWhatsAppWebMessage, sendWhatsAppWebMedia, sendWhatsAppWebTyping } = await import('@/lib/whatsapp-web');
  const fileName = payload.fileName || (payload.mediaUrl ? decodeURIComponent(payload.mediaUrl.split('?')[0].split('/').pop() || 'arquivo') : 'arquivo');
  const webConnected = getWhatsAppWebStatus(tenantId).connected;

  if (channel === 'web' && !webConnected) throw new ChannelError('O WhatsApp Web está desconectado. Conecte de novo em Integrações.');

  if (channel !== 'api' && webConnected && !payload.template) {
    const typing = Math.min(10, Math.max(0, Number(payload.typingSeconds) || 0));
    if (typing > 0) {
      await sendWhatsAppWebTyping(tenantId, phone);
      await sleep(typing * 1000);
    }
    if (payload.mediaUrl) {
      const url = await assertPublicHttpsUrl(payload.mediaUrl);
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Não foi possível baixar o arquivo (${response.status}).`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 16 * 1024 * 1024) throw new Error('Arquivo acima de 16 MB.');
      const fallbackType = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mpeg', document: 'application/pdf' }[payload.mediaKind || 'document'];
      const mimetype = response.headers.get('content-type') || fallbackType;
      await sendWhatsAppWebMedia(tenantId, phone, buffer, payload.mediaKind || 'document', { caption: payload.caption, fileName, mimetype });
      return { provider: 'whatsapp_web', text: payload.caption || '' };
    }
    const text = payload.menu ? withOptions(payload.menu) : payload.text || '';
    await sendWhatsAppWebMessage(tenantId, phone, text);
    return { provider: 'whatsapp_web', text };
  }

  const { WhatsAppService, getWhatsAppConfig } = await import('@/lib/whatsapp');
  const config = await getWhatsAppConfig(supabaseAdmin, tenantId).catch(() => null);
  if (!config) {
    throw new ChannelError(channel === 'api' ? 'A API oficial do WhatsApp não está configurada em Integrações.' : 'Nenhum WhatsApp conectado: conecte o WhatsApp Web ou a API oficial em Integrações.');
  }
  const service = new WhatsAppService(config);
  let result: { success: boolean; error?: string };
  let text = payload.text || payload.caption || '';
  if (payload.template) {
    const params = payload.template.params.map((value) => ({ type: 'text' as const, text: value || '-' }));
    result = await service.sendTemplate(phone, payload.template.name, payload.template.language, params.length ? [{ type: 'body', parameters: params }] : undefined);
    text = payload.template.preview;
  } else if (payload.mediaUrl) {
    const kind = payload.mediaKind || 'document';
    result = kind === 'image' ? await service.sendImage(phone, payload.mediaUrl, payload.caption)
      : kind === 'video' ? await service.sendVideo(phone, payload.mediaUrl, payload.caption)
        : kind === 'audio' ? await service.sendAudio(phone, payload.mediaUrl)
          : await service.sendDocument(phone, payload.mediaUrl, fileName, payload.caption);
  } else if (payload.menu && payload.menu.options.length <= 3) {
    result = await service.sendButtons(phone, payload.menu.body, payload.menu.options.map((option) => ({ id: option.id, title: option.title.slice(0, 20) })));
    text = withOptions(payload.menu);
  } else if (payload.menu) {
    result = await service.sendList(phone, payload.menu.body, payload.menu.buttonLabel.slice(0, 20) || 'Ver opções', [
      { title: 'Opções', rows: payload.menu.options.map((option) => ({ id: option.id, title: option.title.slice(0, 24) })) },
    ]);
    text = withOptions(payload.menu);
  } else {
    result = await service.sendText(phone, text);
  }
  if (!result.success) throw new Error(result.error || 'A Meta recusou a mensagem.');
  return { provider: 'meta', text };
}

const MEDIA_LABEL: Record<MediaKind, string> = { image: '📷 Imagem', video: '🎬 Vídeo', audio: '🎧 Áudio', document: '📎 Arquivo' };

/** Registra na conversa do lead uma mensagem que a empresa enviou (robô, campanha). */
export async function recordOutbound(tenantId: string, leadId: string, sent: { provider: string; text: string }, payload: Pick<WhatsAppPayload, 'mediaUrl' | 'mediaKind'>, prefix = '🤖', origin: MessageOrigin = 'automation') {
  const label = MEDIA_LABEL[payload.mediaKind || 'document'];
  const preview = payload.mediaUrl ? `${sent.text ? `${sent.text}\n` : `${label}\n`}${payload.mediaUrl}` : sent.text;
  await insertChatMessage({
    tenant_id: tenantId,
    lead_id: leadId,
    text: preview,
    sent_by_me: true,
    type: 'text',
    status: 'sent',
    provider: sent.provider,
    origin,
  });
  await supabaseAdmin.from('leads').update({ last_msg: `${prefix} ${(sent.text || label).split('\n')[0]}`.slice(0, 200) }).eq('tenant_id', tenantId).eq('id', leadId);
}

/**
 * Envia para o lead e registra na conversa (aparece em Mensagens, como as
 * respostas da equipe). Conversa do Direct/Messenger responde por lá.
 */
export async function sendToLead(tenantId: string, leadId: string, phone: string, payload: WhatsAppPayload, origin: MessageOrigin = 'automation') {
  const { socialTargetForLead, sendSocialMessage, SocialChannelError } = await import('@/lib/social/inbox');
  const social = await socialTargetForLead(tenantId, leadId).catch((error) => {
    throw error instanceof SocialChannelError ? new ChannelError(error.message) : error;
  });
  if (social) {
    if (payload.template) throw new ChannelError('Modelos aprovados da Meta só existem no WhatsApp: esta conversa é do Instagram/Messenger.');
    const text = payload.menu ? withOptions(payload.menu) : payload.text || '';
    const sent = await sendSocialMessage(social, payload.mediaUrl
      ? { mediaUrl: payload.mediaUrl, mediaKind: payload.mediaKind, caption: payload.caption, typingSeconds: payload.typingSeconds }
      : { text, typingSeconds: payload.typingSeconds });
    await recordOutbound(tenantId, leadId, { provider: social.channel, text: payload.mediaUrl ? sent.text : text }, payload, '🤖', origin);
    return;
  }
  const sent = await deliverWhatsApp(tenantId, phone, payload);
  await recordOutbound(tenantId, leadId, sent, payload, '🤖', origin);
}
