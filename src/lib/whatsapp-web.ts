import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

type WhatsAppWebRuntime = {
  socket: WASocket | null;
  status: ConnectionStatus;
  qrCode: string | null;
  phone: string | null;
  starting: Promise<void> | null;
};

const globalRuntime = globalThis as typeof globalThis & {
  __vtecWhatsAppWeb?: WhatsAppWebRuntime;
};

const runtime = globalRuntime.__vtecWhatsAppWeb ?? {
  socket: null,
  status: 'disconnected' as const,
  qrCode: null,
  phone: null,
  starting: null,
};

globalRuntime.__vtecWhatsAppWeb = runtime;

const SESSION_PATH = process.env.WHATSAPP_WEB_SESSION_PATH
  || path.join(process.cwd(), '.whatsapp-session');

function shouldReconnect(error: unknown) {
  const statusCode = (error as { output?: { statusCode?: number } })?.output?.statusCode;
  return statusCode !== DisconnectReason.loggedOut;
}

export async function startWhatsAppWeb() {
  if (runtime.socket || runtime.starting) return runtime.starting;

  runtime.status = 'connecting';
  runtime.starting = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
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
        const text = item.message?.conversation || item.message?.extendedTextMessage?.text;
        if (!text) continue;

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
        await processInboundWhatsAppMessage({
          phone: phoneJid.replace(/@.*$/, ''),
          isGroup: false,
          senderName: item.pushName || 'Cliente WhatsApp',
          text: { message: text },
        }, supabaseAdmin);
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
          setTimeout(() => void startWhatsAppWeb(), 2_000);
        }
      }
    });
  })().finally(() => {
    runtime.starting = null;
  });

  return runtime.starting;
}

export function getWhatsAppWebStatus() {
  return {
    status: runtime.status,
    connected: runtime.status === 'connected',
    qrCode: runtime.qrCode,
    phone: runtime.phone,
  };
}

async function ensureConnectedSocket(): Promise<WASocket> {
  if (!runtime.socket || runtime.status !== 'connected') {
    await startWhatsAppWeb();
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

export async function sendWhatsAppWebMessage(phone: string, message: string) {
  const socket = await ensureConnectedSocket();
  return socket.sendMessage(toWhatsAppJid(phone), { text: message });
}

/**
 * Envia um arquivo/imagem/áudio pelo WhatsApp Web. `buffer` já deve estar
 * no bucket de mídia (chat-media) e ser o mesmo conteúdo -- passamos o
 * buffer direto pro Baileys (em vez da URL pública) pra não depender de
 * o arquivo já estar propagado/acessível no CDN no exato instante do envio.
 */
export async function sendWhatsAppWebMedia(
  phone: string,
  buffer: Buffer,
  kind: 'image' | 'document' | 'audio',
  options: { caption?: string; fileName?: string; mimetype: string }
) {
  const socket = await ensureConnectedSocket();
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

export async function disconnectWhatsAppWeb() {
  if (runtime.socket) await runtime.socket.logout();
  runtime.socket = null;
  runtime.status = 'disconnected';
  runtime.qrCode = null;
  runtime.phone = null;
}
