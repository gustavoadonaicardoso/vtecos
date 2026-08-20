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
      const { handleZapiWebhook } = await import('@/lib/zapi');

      for (const item of messages) {
        if (item.key.fromMe || !item.key.remoteJid || item.key.remoteJid.endsWith('@g.us')) continue;
        const text = item.message?.conversation || item.message?.extendedTextMessage?.text;
        if (!text) continue;

        await handleZapiWebhook({
          phone: item.key.remoteJid.replace('@s.whatsapp.net', ''),
          isGroup: false,
          senderName: item.pushName || 'Cliente WhatsApp',
          text: { message: text },
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

export async function sendWhatsAppWebMessage(phone: string, message: string) {
  if (!runtime.socket || runtime.status !== 'connected') {
    await startWhatsAppWeb();
  }

  for (let attempt = 0; attempt < 20 && runtime.status === 'connecting'; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!runtime.socket || runtime.status !== 'connected') {
    throw new Error('WhatsApp Web não está conectado. Escaneie o QR Code em Integrações.');
  }

  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return runtime.socket.sendMessage(`${normalized}@s.whatsapp.net`, { text: message });
}

export async function disconnectWhatsAppWeb() {
  if (runtime.socket) await runtime.socket.logout();
  runtime.socket = null;
  runtime.status = 'disconnected';
  runtime.qrCode = null;
  runtime.phone = null;
}
