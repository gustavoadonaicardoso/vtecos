import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { emitIntegrationEvent, leadEventData } from '@/lib/integrations/events';

// downloadMediaMessage exige um logger no formato do pino -- não
// precisamos de log de verdade aqui, só satisfazer o formato esperado.
const silentLogger = {
  level: 'silent',
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (obj: unknown) => console.error('[whatsapp-web:media]', obj),
};

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

type WhatsAppWebRuntime = {
  socket: WASocket | null;
  status: ConnectionStatus;
  qrCode: string | null;
  phone: string | null;
  starting: Promise<void> | null;
};

/**
 * Uma sessão de WhatsApp Web POR EMPRESA (cada uma com seu número e sua
 * pasta de credenciais). Mensagens recebidas viram leads só da empresa
 * dona daquele número.
 */
const globalRuntime = globalThis as typeof globalThis & {
  __vtecWhatsAppWebByTenant?: Map<string, WhatsAppWebRuntime>;
  __vtecPlatformTenantId?: string | null;
};

const runtimes = globalRuntime.__vtecWhatsAppWebByTenant ?? new Map<string, WhatsAppWebRuntime>();
globalRuntime.__vtecWhatsAppWebByTenant = runtimes;

function runtimeFor(tenantId: string): WhatsAppWebRuntime {
  let runtime = runtimes.get(tenantId);
  if (!runtime) {
    runtime = { socket: null, status: 'disconnected', qrCode: null, phone: null, starting: null };
    runtimes.set(tenantId, runtime);
  }
  return runtime;
}

const BASE_SESSION_PATH = process.env.WHATSAPP_WEB_SESSION_PATH
  || path.join(process.cwd(), '.whatsapp-session');
const TENANT_SESSIONS_DIR = `${BASE_SESSION_PATH}-tenants`;

async function platformTenantId() {
  if (globalRuntime.__vtecPlatformTenantId !== undefined) return globalRuntime.__vtecPlatformTenantId;
  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data } = await supabaseAdmin.from('tenants').select('id').eq('is_platform', true).maybeSingle();
  globalRuntime.__vtecPlatformTenantId = data?.id ?? null;
  return globalRuntime.__vtecPlatformTenantId;
}

/** A Vórtice mantém a pasta antiga (não precisa escanear o QR de novo). */
async function sessionPathFor(tenantId: string) {
  if (tenantId === (await platformTenantId())) return BASE_SESSION_PATH;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('Empresa inválida.');
  return path.join(TENANT_SESSIONS_DIR, tenantId);
}

function shouldReconnect(error: unknown) {
  const statusCode = (error as { output?: { statusCode?: number } })?.output?.statusCode;
  return statusCode !== DisconnectReason.loggedOut;
}

export async function startWhatsAppWeb(tenantId: string) {
  const runtime = runtimeFor(tenantId);
  if (runtime.socket || runtime.starting) return runtime.starting;

  runtime.status = 'connecting';
  runtime.starting = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(await sessionPathFor(tenantId));
    const socket = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu('VTEC OS'),
      markOnlineOnConnect: false,
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    runtime.socket = socket;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      const { processInboundWhatsAppMessage } = await import('@/lib/messaging');
      const { supabaseAdmin } = await import('@/lib/supabase-admin');

      for (const item of messages) {
        if (item.key.fromMe || !item.key.remoteJid || item.key.remoteJid.endsWith('@g.us')) continue;

        const content = item.message;
        if (!content) continue;

        const text = content.conversation || content.extendedTextMessage?.text;
        // Figurinha, imagem, áudio e documento recebidos não têm texto
        // nenhum (conversation/extendedTextMessage) -- antes disso, essas
        // mensagens eram descartadas em silêncio (o "if (!text) continue"
        // pulava tudo que não fosse texto puro).
        const mediaContent =
          content.imageMessage || content.stickerMessage || content.audioMessage || content.documentMessage;
        if (!text && !mediaContent) continue;

        let media: { url: string; kind: 'image' | 'audio' | 'document' } | undefined;
        let mediaCaption: string | undefined;

        if (mediaContent) {
          try {
            const buffer = await downloadMediaMessage(
              item as WAMessage,
              'buffer',
              {},
              { logger: silentLogger, reuploadRequest: socket.updateMediaMessage }
            );

            // Figurinha é sempre webp -- tratamos como imagem pra
            // reaproveitar a mesma renderização (a tela já sabe mostrar
            // imagem com preview).
            const kind: 'image' | 'audio' | 'document' = content.imageMessage
              ? 'image'
              : content.stickerMessage
              ? 'image'
              : content.audioMessage
              ? 'audio'
              : 'document';

            const mimetype = mediaContent.mimetype || 'application/octet-stream';
            const ext = content.stickerMessage ? 'webp' : (mimetype.split('/')[1]?.split(';')[0] || 'bin');
            const storagePath = `${tenantId}/inbound/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

            const { supabaseAdmin: admin } = await import('@/lib/supabase-admin');
            const { error: uploadError } = await admin.storage
              .from('chat-media')
              .upload(storagePath, buffer, { contentType: mimetype });

            if (!uploadError) {
              const { data } = admin.storage.from('chat-media').getPublicUrl(storagePath);
              media = { url: data.publicUrl, kind };
              mediaCaption = content.imageMessage?.caption || content.documentMessage?.caption || undefined;
            } else {
              console.error('[whatsapp-web] Falha ao salvar mídia recebida:', uploadError.message);
            }
          } catch (err) {
            console.error('[whatsapp-web] Falha ao baixar mídia recebida:', err);
          }
        }

        // O WhatsApp pode identificar o contato por um LID (@lid, sistema
        // de privacidade de número) em vez do telefone de verdade
        // (@s.whatsapp.net) -- nesse caso remoteJid não é um telefone e
        // nunca bate com o lead existente, criando um contato duplicado a
        // cada mensagem. remoteJidAlt já vem preenchido com o JID de
        // telefone quando o Baileys conhece o par; se não vier, resolve
        // pelo mapeamento LID->PN da própria lib.
        let phoneJid = item.key.remoteJidAlt || item.key.remoteJid;
        if (phoneJid.endsWith('@lid')) {
          const resolved = await socket.signalRepository.lidMapping.getPNForLID(phoneJid).catch(() => null);
          if (resolved) phoneJid = resolved;
        }

        // Sem passar supabaseAdmin aqui, a função usava o client anon por
        // padrão -- como leads/chat_messages sempre exigiram um papel
        // autenticado, a busca/criação do lead falhava silenciosamente
        // (erros descartados) e a mensagem recebida nunca era salva.
        // O lead e a mensagem entram na empresa dona DESTE número.
        await processInboundWhatsAppMessage({
          phone: phoneJid.replace(/@.*$/, ''),
          isGroup: false,
          senderName: item.pushName || 'Cliente WhatsApp',
          text: { message: text || mediaCaption || '' },
          media,
        }, supabaseAdmin, tenantId, {
          leadCreated: (lead) => emitIntegrationEvent(tenantId, 'lead.created', leadEventData(lead, 'whatsapp')),
          messageReceived: (data) => emitIntegrationEvent(tenantId, 'message.received', data),
        });
      }
    });
    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        runtime.qrCode = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
        runtime.status = 'qr';
      }

      if (connection === 'open') {
        runtime.status = 'connected';
        runtime.qrCode = null;
        runtime.phone = socket.user?.id?.split(':')[0] ?? null;
      }

      if (connection === 'close') {
        runtime.socket = null;
        runtime.qrCode = null;
        runtime.status = 'disconnected';
        runtime.phone = null;

        if (shouldReconnect(lastDisconnect?.error)) {
          setTimeout(() => void startWhatsAppWeb(tenantId), 2_000);
        }
      }
    });
  })().finally(() => {
    runtime.starting = null;
  });

  return runtime.starting;
}

export function getWhatsAppWebStatus(tenantId: string) {
  const runtime = runtimeFor(tenantId);
  return {
    status: runtime.status,
    connected: runtime.status === 'connected',
    qrCode: runtime.qrCode,
    phone: runtime.phone,
  };
}

async function ensureConnectedSocket(tenantId: string): Promise<WASocket> {
  const runtime = runtimeFor(tenantId);
  if (!runtime.socket || runtime.status !== 'connected') {
    await startWhatsAppWeb(tenantId);
  }

  for (let attempt = 0; attempt < 20 && runtime.status === 'connecting'; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!runtime.socket || runtime.status !== 'connected') {
    throw new Error('WhatsApp Web não está conectado. Escaneie o QR Code em Integrações.');
  }

  return runtime.socket;
}

function toWhatsAppJid(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `${normalized}@s.whatsapp.net`;
}

/** Envia pelo WhatsApp da empresa informada (nunca pelo de outra). */
export async function sendWhatsAppWebMessage(tenantId: string, phone: string, message: string) {
  const socket = await ensureConnectedSocket(tenantId);
  return socket.sendMessage(toWhatsAppJid(phone), { text: message });
}

/**
 * Envia um arquivo/imagem/áudio pelo WhatsApp Web. `buffer` já deve estar
 * no bucket de mídia (chat-media) e ser o mesmo conteúdo -- passamos o
 * buffer direto pro Baileys (em vez da URL pública) pra não depender de
 * o arquivo já estar propagado/acessível no CDN no exato instante do envio.
 */
export async function sendWhatsAppWebMedia(
  tenantId: string,
  phone: string,
  buffer: Buffer,
  kind: 'image' | 'document' | 'audio',
  options: { caption?: string; fileName?: string; mimetype: string }
) {
  const socket = await ensureConnectedSocket(tenantId);
  const jid = toWhatsAppJid(phone);

  if (kind === 'image') {
    return socket.sendMessage(jid, { image: buffer, caption: options.caption });
  }

  if (kind === 'audio') {
    return socket.sendMessage(jid, { audio: buffer, mimetype: options.mimetype, ptt: false });
  }

  return socket.sendMessage(jid, {
    document: buffer,
    mimetype: options.mimetype,
    fileName: options.fileName || 'arquivo',
    caption: options.caption,
  });
}

export async function disconnectWhatsAppWeb(tenantId: string) {
  const runtime = runtimeFor(tenantId);
  if (runtime.socket) await runtime.socket.logout();
  runtime.socket = null;
  runtime.status = 'disconnected';
  runtime.qrCode = null;
  runtime.phone = null;
}

/**
 * Ao subir o servidor, religa as sessões que já foram pareadas (pasta de
 * credenciais existente), para as mensagens recebidas continuarem
 * entrando sem ninguém precisar abrir a tela de Integrações.
 */
export async function resumeSavedWhatsAppSessions() {
  const fs = await import('node:fs/promises');
  const tenantIds: string[] = [];

  const platform = await platformTenantId();
  if (platform && (await fs.stat(path.join(BASE_SESSION_PATH, 'creds.json')).catch(() => null))) {
    tenantIds.push(platform);
  }
  const entries = await fs.readdir(TENANT_SESSIONS_DIR).catch(() => [] as string[]);
  for (const entry of entries) {
    if (/^[0-9a-f-]{36}$/i.test(entry) && (await fs.stat(path.join(TENANT_SESSIONS_DIR, entry, 'creds.json')).catch(() => null))) {
      tenantIds.push(entry);
    }
  }

  for (const tenantId of tenantIds) {
    await startWhatsAppWeb(tenantId)?.catch((error) => console.error('[whatsapp-web] Falha ao religar sessão', tenantId, error));
  }
}
