/**
 * ============================================================
 * VTEC OS — Direct do Instagram e Messenger (server-only)
 * ============================================================
 * Mensagens que chegam no Direct do Instagram ou na Página do Facebook
 * viram lead e conversa em Mensagens, igual ao WhatsApp. A resposta sai
 * pela mesma conta conectada em Redes Sociais > Contas (token da Página).
 *
 * Regras da Meta que valem aqui:
 *  - só dá para responder até 24 h depois da última mensagem do cliente;
 *  - a empresa não inicia conversa (não há disparo pelo Direct);
 *  - o id da pessoa muda de uma conta da empresa para outra.
 * ============================================================
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { META_GRAPH_URL } from '@/lib/meta-graph-version';
import { platformSettings } from '@/lib/platform-settings';
import { safeContentType } from '@/lib/safe-content-type';
import { insertChatMessage } from '@/lib/chat-messages';
import { logAudit } from '@/lib/audit';
import { emitIntegrationEvent, leadEventData } from '@/lib/integrations/events';
import { fireAutomation, onInboundMessage, onLeadCreated } from '@/lib/automations/engine';

export type SocialChannel = 'instagram' | 'messenger';

export const CHANNEL_LABEL: Record<SocialChannel, string> = { instagram: 'Instagram Direct', messenger: 'Messenger' };

/** Tamanho máximo de um texto: Instagram conta bytes (1000), Messenger caracteres (2000). */
const TEXT_LIMIT: Record<SocialChannel, number> = { instagram: 1000, messenger: 2000 };
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

type Row = Record<string, unknown>;

export interface SocialAccountRow {
  id: string;
  tenant_id: string;
  platform: 'instagram' | 'facebook';
  external_id: string;
  page_id: string;
  name: string;
  access_token: string;
}

// ── Webhook ────────────────────────────────────────────────────

interface Attachment {
  type?: string;
  payload?: { url?: string; title?: string };
}

export interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    app_id?: number | string;
    metadata?: string;
    attachments?: Attachment[];
    reply_to?: { story?: { url?: string } };
  };
}

export interface SocialWebhookPayload {
  object: 'instagram' | 'page';
  entry?: { id?: string; time?: number; messaging?: MessagingEvent[] }[];
}

export const isSocialObject = (object: unknown): object is SocialWebhookPayload['object'] => object === 'instagram' || object === 'page';

/**
 * Instagram e Messenger chegam assinados com a chave secreta do app da
 * Vórtice (Painel Master > Plataforma). Sem chave, recusa.
 */
export async function validSocialSignature(rawBody: string, signature: string) {
  const { metaAppSecret } = await platformSettings();
  if (!metaAppSecret || !signature.startsWith('sha256=')) return false;
  const received = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', metaAppSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const MARKER = 'vtec:';

/** Conta conectada (Redes Sociais > Contas) que recebeu o evento. */
async function accountFor(object: SocialWebhookPayload['object'], externalId: string): Promise<SocialAccountRow | null> {
  // tenant-scope: ok (o id da conta na Meta define a empresa; a conta é única)
  const { data } = await supabaseAdmin
    .from('social_accounts')
    .select('id, tenant_id, platform, external_id, page_id, name, access_token')
    .eq('platform', object === 'instagram' ? 'instagram' : 'facebook')
    .eq('external_id', externalId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as SocialAccountRow | null) ?? null;
}

/** Processa o webhook inteiro. Erro num evento não derruba os outros. */
export async function processSocialWebhook(payload: SocialWebhookPayload) {
  const channel: SocialChannel = payload.object === 'instagram' ? 'instagram' : 'messenger';
  for (const entry of payload.entry || []) {
    if (!entry.id || !entry.messaging?.length) continue;
    const account = await accountFor(payload.object, entry.id);
    if (!account) {
      console.warn(`[${CHANNEL_LABEL[channel]}] Conta sem empresa no sistema, evento ignorado:`, entry.id);
      continue;
    }
    for (const event of entry.messaging) {
      await handleEvent(account, channel, event).catch((error) => console.error(`[${CHANNEL_LABEL[channel]}] Falha ao processar mensagem:`, error));
    }
  }
}

async function alreadySaved(tenantId: string, externalId: string) {
  const { data } = await supabaseAdmin.from('chat_messages').select('id').eq('tenant_id', tenantId).eq('external_id', externalId).limit(1);
  return Boolean(data && data.length);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function handleEvent(account: SocialAccountRow, channel: SocialChannel, event: MessagingEvent) {
  const message = event.message;
  if (!message?.mid || message.is_deleted) return;
  const echo = message.is_echo === true;
  const customerId = echo ? event.recipient?.id : event.sender?.id;
  if (!customerId || customerId === account.external_id || customerId === account.page_id) return;
  if (await alreadySaved(account.tenant_id, message.mid)) return;

  if (echo) {
    // Eco do que a empresa mandou. O que saiu pelo sistema já está na
    // conversa; o que alguém respondeu pelo app do Instagram/Facebook entra
    // como "pelo celular", e a IA fica quieta como no WhatsApp.
    const { metaAppId } = await platformSettings();
    if ((message.app_id && metaAppId && String(message.app_id) === String(metaAppId)) || message.metadata?.startsWith(MARKER)) return;
    await sleep(4000);
    if (await alreadySaved(account.tenant_id, message.mid)) return;
    const lead = await findLead(account.tenant_id, channel, customerId);
    if (!lead) return;
    const content = await readContent(account.tenant_id, String(lead.id), message);
    const { error } = await insertChatMessage({ tenant_id: account.tenant_id, lead_id: String(lead.id), text: content.text, type: content.type, audio_url: content.mediaUrl, sent_by_me: true, status: 'sent', provider: channel, external_id: message.mid, origin: 'phone' });
    if (error) return;
    await supabaseAdmin.from('leads').update({ last_msg: content.preview.slice(0, 200), human_replied_at: new Date().toISOString() }).eq('tenant_id', account.tenant_id).eq('id', lead.id);
    return;
  }

  let lead = await findLead(account.tenant_id, channel, customerId);
  let isNewLead = false;
  if (!lead) {
    lead = await createLead(account, channel, customerId);
    isNewLead = Boolean(lead?.__created);
  }
  if (!lead) return;
  const leadId = String(lead.id);

  const content = await readContent(account.tenant_id, leadId, message);
  const { error } = await insertChatMessage({ tenant_id: account.tenant_id, lead_id: leadId, text: content.text, type: content.type, audio_url: content.mediaUrl, sent_by_me: false, status: 'received', provider: channel, external_id: message.mid });
  if (error) {
    console.error(`[${CHANNEL_LABEL[channel]}] Erro ao salvar mensagem:`, error.message);
    return;
  }

  // A resposta sai pelo canal e pela conta em que o cliente escreveu por último.
  const accountColumn = channel === 'instagram' ? 'instagram_account_id' : 'messenger_account_id';
  await supabaseAdmin
    .from('leads')
    .update({ last_msg: content.preview.slice(0, 200), chat_channel: channel, [accountColumn]: account.id })
    .eq('tenant_id', account.tenant_id)
    .eq('id', leadId);

  emitIntegrationEvent(account.tenant_id, 'message.received', {
    lead_id: leadId,
    lead_name: String(lead.name || ''),
    phone: (lead.phone as string) || null,
    channel,
    text: content.text || null,
    type: content.type,
    media_url: content.mediaUrl,
    received_at: new Date().toISOString(),
  });
  fireAutomation(onInboundMessage, account.tenant_id, leadId, content.text || '', { isNewContact: isNewLead });
}

// ── Lead ───────────────────────────────────────────────────────

const ID_COLUMN: Record<SocialChannel, 'instagram_id' | 'messenger_id'> = { instagram: 'instagram_id', messenger: 'messenger_id' };

async function findLead(tenantId: string, channel: SocialChannel, customerId: string): Promise<Row | null> {
  const { data } = await supabaseAdmin.from('leads').select('id, name, phone').eq('tenant_id', tenantId).eq(ID_COLUMN[channel], customerId).maybeSingle();
  return (data as Row | null) ?? null;
}

/** Nome (e @ do Instagram) de quem mandou. Se a Meta não informar, fica um nome genérico. */
async function fetchProfile(account: SocialAccountRow, channel: SocialChannel, customerId: string): Promise<{ name: string; username: string | null }> {
  const fields = channel === 'instagram' ? 'name,username' : 'first_name,last_name';
  try {
    const response = await fetch(`${META_GRAPH_URL}/${encodeURIComponent(customerId)}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => ({}))) as Row;
    if (response.ok) {
      if (channel === 'instagram') {
        const username = (body.username as string) || null;
        return { name: String(body.name || (username ? `@${username}` : '')).trim() || 'Cliente Instagram', username };
      }
      const name = `${body.first_name || ''} ${body.last_name || ''}`.trim();
      return { name: name || 'Cliente Messenger', username: null };
    }
  } catch {
    // Sem nome: segue com o genérico.
  }
  return { name: channel === 'instagram' ? 'Cliente Instagram' : 'Cliente Messenger', username: null };
}

async function createLead(account: SocialAccountRow, channel: SocialChannel, customerId: string): Promise<(Row & { __created?: boolean }) | null> {
  const tenantId = account.tenant_id;
  const profile = await fetchProfile(account, channel, customerId);
  const { data: stages } = await supabaseAdmin.from('pipeline_stages').select('id').eq('tenant_id', tenantId).order('position').limit(1);

  const row: Row = {
    tenant_id: tenantId,
    name: profile.name,
    stage_id: stages?.[0]?.id ?? null,
    source: channel === 'instagram' ? 'Instagram' : 'Facebook',
    channels: [channel === 'instagram' ? 'instagram' : 'facebook'],
    chat_channel: channel,
    [ID_COLUMN[channel]]: customerId,
    [channel === 'instagram' ? 'instagram_account_id' : 'messenger_account_id']: account.id,
    ...(profile.username ? { instagram_username: profile.username } : {}),
  };
  // tenant-scope: ok (a linha inserida traz tenant_id da conta)
  const { data, error } = await supabaseAdmin.from('leads').insert([row]).select().single();
  if (error) {
    // Duas mensagens seguidas de um contato novo: a outra já criou o lead.
    if ((error as { code?: string }).code === '23505') return findLead(tenantId, channel, customerId);
    console.error(`[${CHANNEL_LABEL[channel]}] Erro ao criar lead:`, error.message);
    return null;
  }

  const lead = data as Row;
  const source = channel === 'instagram' ? 'instagram' : 'messenger';
  emitIntegrationEvent(tenantId, 'lead.created', leadEventData(lead, source));
  fireAutomation(onLeadCreated, tenantId, String(lead.id), source);
  await logAudit(null, 'LEAD_CREATE', `Lead "${profile.name}" criado por mensagem no ${CHANNEL_LABEL[channel]} (${account.name}).`, 'lead', String(lead.id), supabaseAdmin, tenantId).catch(() => {});
  return { ...lead, __created: true };
}

// ── Conteúdo recebido ──────────────────────────────────────────

type Content = { text: string; type: 'text' | 'image' | 'audio' | 'document'; mediaUrl: string | null; preview: string };

const EXTENSION: Record<string, string> = { image: 'jpg', audio: 'mp4', video: 'mp4', file: 'bin' };

/**
 * Os links de mídia da Meta expiram em poucos dias: o arquivo é copiado
 * para o armazenamento do sistema. Se falhar, fica o link original.
 */
async function storeMedia(tenantId: string, leadId: string, url: string, kind: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return url;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_MEDIA_BYTES) return url;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) return url;
    const contentType = safeContentType(response.headers.get('content-type'));
    const ext = contentType.split('/')[1]?.split(';')[0].replace(/[^a-z0-9]/g, '').replace('octetstream', 'bin').replace('jpeg', 'jpg') || EXTENSION[kind] || 'bin';
    const path = `${tenantId}/${leadId}/in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseAdmin.storage.from('chat-media').upload(path, buffer, { contentType, upsert: false });
    if (error) return url;
    return supabaseAdmin.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
  } catch {
    return url;
  }
}

export async function readContent(tenantId: string, leadId: string, message: NonNullable<MessagingEvent['message']>): Promise<Content> {
  const text = (message.text || '').trim();
  const storyReply = message.reply_to?.story ? '↩️ Respondeu ao seu story' : '';
  const attachment = message.attachments?.[0];

  if (!attachment) {
    if (message.is_unsupported) return { text: '💬 Mensagem que o sistema não consegue mostrar (abra no app).', type: 'text', mediaUrl: null, preview: '💬 Nova mensagem' };
    const full = [storyReply, text].filter(Boolean).join('\n');
    return { text: full, type: 'text', mediaUrl: null, preview: full || '💬 Nova mensagem' };
  }

  const url = attachment.payload?.url || '';
  switch (attachment.type) {
    case 'image':
      return { text, type: 'image', mediaUrl: url ? await storeMedia(tenantId, leadId, url, 'image') : null, preview: text || '📷 Imagem' };
    case 'audio':
      return { text, type: 'audio', mediaUrl: url ? await storeMedia(tenantId, leadId, url, 'audio') : null, preview: '🎵 Áudio' };
    case 'video':
      return { text: text || '🎬 Vídeo', type: 'document', mediaUrl: url ? await storeMedia(tenantId, leadId, url, 'video') : null, preview: '🎬 Vídeo' };
    case 'file':
      return { text: text || attachment.payload?.title || '📄 Arquivo', type: 'document', mediaUrl: url ? await storeMedia(tenantId, leadId, url, 'file') : null, preview: '📄 Arquivo' };
    case 'story_mention':
      return { text: `📣 Mencionou a empresa no story${url ? `\n${url}` : ''}`, type: 'text', mediaUrl: null, preview: '📣 Mencionou você no story' };
    case 'share':
    case 'ig_reel':
    case 'reel':
    case 'ig_post':
      return { text: [text, `🔗 Compartilhou uma publicação${url ? `\n${url}` : ''}`].filter(Boolean).join('\n'), type: 'text', mediaUrl: null, preview: '🔗 Publicação compartilhada' };
    case 'like_heart':
      return { text: '❤️', type: 'text', mediaUrl: null, preview: '❤️' };
    case 'location':
      return { text: '📍 Localização', type: 'text', mediaUrl: null, preview: '📍 Localização' };
    default:
      return { text: text || '💬 Mensagem que o sistema não consegue mostrar (abra no app).', type: 'text', mediaUrl: null, preview: text || '💬 Nova mensagem' };
  }
}

// ── Envio ──────────────────────────────────────────────────────

export interface SocialTarget {
  channel: SocialChannel;
  recipientId: string;
  account: SocialAccountRow;
}

export class SocialChannelError extends Error {}

/**
 * Conversa do Instagram/Messenger? Devolve para quem e por qual conta
 * responder. `null` = conversa de WhatsApp (segue o caminho de sempre).
 */
export async function socialTargetForLead(tenantId: string, leadId: string): Promise<SocialTarget | null> {
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('chat_channel, instagram_id, instagram_account_id, messenger_id, messenger_account_id')
    .eq('tenant_id', tenantId)
    .eq('id', leadId)
    .maybeSingle();
  // Banco sem a migration (coluna não existe) ou conversa de WhatsApp.
  if (!lead || (lead.chat_channel !== 'instagram' && lead.chat_channel !== 'messenger')) return null;

  const channel = lead.chat_channel as SocialChannel;
  const recipientId = channel === 'instagram' ? lead.instagram_id : lead.messenger_id;
  const accountId = channel === 'instagram' ? lead.instagram_account_id : lead.messenger_account_id;
  if (!recipientId || !accountId) return null;

  const { data: account } = await supabaseAdmin
    .from('social_accounts')
    .select('id, tenant_id, platform, external_id, page_id, name, access_token, status')
    .eq('tenant_id', tenantId)
    .eq('id', accountId)
    .maybeSingle();
  if (!account || account.status !== 'active' || !account.access_token) {
    throw new SocialChannelError(`A conta do ${channel === 'instagram' ? 'Instagram' : 'Facebook'} desta conversa está desconectada. Reconecte em Redes Sociais > Contas.`);
  }
  return { channel, recipientId: String(recipientId), account: account as SocialAccountRow };
}

/** Erros da Meta em português. */
export function friendlySocialError(error: { message?: string; code?: number; error_subcode?: number }, channel: SocialChannel) {
  const text = error.message || '';
  if (error.error_subcode === 2018278 || error.error_subcode === 2534022 || /outside of allowed window|24 hours/i.test(text)) {
    return `Passaram 24 h desde a última mensagem do cliente: o ${channel === 'instagram' ? 'Instagram' : 'Messenger'} só deixa responder dentro desse prazo. Espere ele escrever de novo.`;
  }
  if (error.code === 190) return 'A conexão com a Meta expirou. Reconecte a conta em Redes Sociais > Contas.';
  if (error.code === 10 || error.code === 200 || error.code === 230) return 'Falta a permissão de mensagens no app da Meta. Reconecte a conta em Redes Sociais > Contas (com as permissões de mensagem marcadas).';
  if (error.code === 551 || /isn.t available|not available/i.test(text)) return 'Esta pessoa não está disponível para receber mensagens agora.';
  return text || 'A Meta recusou a mensagem.';
}

async function postMessage(target: SocialTarget, body: Row): Promise<string | null> {
  const response = await fetch(`${META_GRAPH_URL}/${encodeURIComponent(target.account.page_id)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${target.account.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: target.recipientId }, ...body }),
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string; code?: number; error_subcode?: number } };
  if (!response.ok || json.error) throw new Error(friendlySocialError(json.error || { message: `HTTP ${response.status}` }, target.channel));
  return json.message_id ?? null;
}

/** Quebra textos longos no limite do canal (Instagram conta bytes). */
export function splitText(text: string, channel: SocialChannel): string[] {
  const limit = TEXT_LIMIT[channel];
  const size = (value: string) => (channel === 'instagram' ? Buffer.byteLength(value, 'utf8') : value.length);
  const parts: string[] = [];
  let current = '';
  for (const char of Array.from(text)) {
    if (size(current + char) > limit) {
      const cut = current.lastIndexOf('\n') > limit / 2 ? current.lastIndexOf('\n') : current.lastIndexOf(' ') > limit / 2 ? current.lastIndexOf(' ') : current.length;
      parts.push(current.slice(0, cut).trimEnd());
      current = current.slice(cut).trimStart();
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length ? parts : [''];
}

export type SocialPayload = {
  text?: string;
  mediaUrl?: string;
  mediaKind?: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  typingSeconds?: number;
};

const ATTACHMENT_TYPE = { image: 'image', audio: 'audio', video: 'video', document: 'file' } as const;

/** "Digitando..." antes de responder (se a Meta recusar, segue sem). */
async function showTyping(target: SocialTarget, seconds: number) {
  if (seconds <= 0) return;
  await postMessage(target, { sender_action: 'typing_on' }).catch(() => null);
  await sleep(Math.min(10, seconds) * 1000);
}

/** Envia texto ou arquivo. Devolve o id da (última) mensagem na Meta. */
export async function sendSocialMessage(target: SocialTarget, payload: SocialPayload): Promise<{ externalId: string | null; text: string }> {
  await showTyping(target, Number(payload.typingSeconds) || 0);
  const metadata = `${MARKER}${Date.now()}`;
  let externalId: string | null = null;

  if (payload.mediaUrl) {
    const kind = payload.mediaKind || 'document';
    externalId = await postMessage(target, {
      messaging_type: 'RESPONSE',
      message: { attachment: { type: ATTACHMENT_TYPE[kind], payload: { url: payload.mediaUrl, is_reusable: true } }, metadata },
    });
    const caption = (payload.caption || '').trim();
    for (const part of caption ? splitText(caption, target.channel) : []) {
      externalId = await postMessage(target, { messaging_type: 'RESPONSE', message: { text: part, metadata } });
    }
    return { externalId, text: caption };
  }

  const text = (payload.text || '').trim();
  if (!text) throw new Error('Mensagem vazia.');
  for (const part of splitText(text, target.channel)) {
    externalId = await postMessage(target, { messaging_type: 'RESPONSE', message: { text: part, metadata } });
  }
  return { externalId, text };
}

// ── Liga o recebimento na Página ───────────────────────────────

/**
 * Assina a Página no app da Vórtice para receber as mensagens do
 * Messenger e do Instagram vinculado. Precisa das permissões
 * pages_messaging e pages_manage_metadata.
 */
export async function enablePageMessaging(tenantId: string, pageId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rows } = await supabaseAdmin
    .from('social_accounts')
    .select('id, access_token')
    .eq('tenant_id', tenantId)
    .eq('page_id', pageId)
    .eq('status', 'active');
  const token = (rows || []).find((row) => row.access_token)?.access_token as string | undefined;
  if (!token) return { ok: false, error: 'Conecte a Página de novo em Redes Sociais > Contas.' };

  let failure: string | null = null;
  try {
    const response = await fetch(`${META_GRAPH_URL}/${encodeURIComponent(pageId)}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ subscribed_fields: 'messages,message_echoes' }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string; code?: number } };
    if (!response.ok || json.error || json.success === false) {
      const code = json.error?.code;
      failure = code === 200 || code === 10 || code === 230 || /permission/i.test(json.error?.message || '')
        ? 'Faltam as permissões de mensagens (pages_messaging, pages_manage_metadata e instagram_manage_messages). Adicione no app da Meta e conecte a conta de novo.'
        : json.error?.message || `A Meta recusou (HTTP ${response.status}).`;
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Falha ao falar com a Meta.';
  }

  await supabaseAdmin
    .from('social_accounts')
    .update({ messaging_status: failure ? 'error' : 'on', messaging_error: failure, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('page_id', pageId);
  return failure ? { ok: false, error: failure } : { ok: true };
}
