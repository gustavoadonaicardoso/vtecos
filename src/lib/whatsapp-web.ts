import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
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
  /** Por que a última tentativa não conectou (mostrado em Integrações). */
  lastError: string | null;
  /** Quedas seguidas sem conectar (para não tentar para sempre). */
  failures: number;
  /** Um admin clicou em "Gerar QR Code" e está esperando o código. */
  wantsQr: boolean;
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
    runtime = { socket: null, status: 'disconnected', qrCode: null, phone: null, starting: null, lastError: null, failures: 0, wantsQr: false };
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

function disconnectInfo(error: unknown) {
  const boom = error as { output?: { statusCode?: number }; message?: string } | undefined;
  return { code: boom?.output?.statusCode, message: boom?.message || '' };
}

/**
 * Credenciais que o WhatsApp não aceita mais (desconectado pelo celular,
 * sessão corrompida). Se ficarem na pasta, toda nova tentativa reaproveita
 * a sessão morta e o QR Code nunca aparece.
 */
const DEAD_SESSION_CODES = new Set<number>([
  DisconnectReason.loggedOut,
  DisconnectReason.badSession,
  DisconnectReason.multideviceMismatch,
  DisconnectReason.forbidden,
]);
// Com alguém esperando o QR na tela, desiste antes (a tela espera ~3 min).
const MAX_FAILURES = { waitingQr: 3, background: 6 };
const CONNECT_TIMEOUT_MS = Number(process.env.WHATSAPP_WEB_CONNECT_TIMEOUT_MS) || 45_000;

function restartLater(tenantId: string, delay: number) {
  // O erro já fica em lastError; o catch evita derrubar o processo.
  setTimeout(() => startWhatsAppWeb(tenantId)?.catch(() => undefined), delay);
}

async function clearSession(tenantId: string) {
  const fs = await import('node:fs/promises');
  await fs.rm(await sessionPathFor(tenantId), { recursive: true, force: true }).catch((error) =>
    console.error('[whatsapp-web] Falha ao apagar sessão antiga', tenantId, error));
}

/**
 * O WhatsApp recusa conexões de versões antigas do WhatsApp Web (erro 405,
 * sem QR Code). Busca a versão atual (com cache) e, se não conseguir, usa
 * a que vem com a biblioteca.
 */
async function waVersion() {
  const cache = globalRuntime as typeof globalRuntime & { __vtecWaVersion?: { version: [number, number, number]; at: number } };
  if (cache.__vtecWaVersion && Date.now() - cache.__vtecWaVersion.at < 6 * 3600_000) return cache.__vtecWaVersion.version;
  const latest = await Promise.race([
    fetchLatestBaileysVersion().then((result) => result.version as [number, number, number]).catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 5_000)),
  ]);
  if (latest) cache.__vtecWaVersion = { version: latest, at: Date.now() };
  return latest;
}

/**
 * Chamado quando um admin clica em "Gerar QR Code": zera os erros e liga
 * (ou religa) a sessão. Se já houver um QR Code válido, só devolve o mesmo.
 */
export async function requestWhatsAppWebQr(tenantId: string) {
  const runtime = runtimeFor(tenantId);
  runtime.wantsQr = true;
  if (runtime.socket || runtime.starting) return runtime.starting;
  runtime.lastError = null;
  runtime.failures = 0;
  return startWhatsAppWeb(tenantId);
}

export async function startWhatsAppWeb(tenantId: string) {
  const runtime = runtimeFor(tenantId);
  if (runtime.socket || runtime.starting) return runtime.starting;

  runtime.status = 'connecting';
  runtime.starting = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(await sessionPathFor(tenantId));
    const version = await waVersion();
    const socket = makeWASocket({
      auth: state,
      ...(version ? { version } : {}),
      browser: Browsers.ubuntu('VTEC OS'),
      markOnlineOnConnect: false,
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    runtime.socket = socket;
    // Se a rede travar, o Baileys pode ficar em "conectando" para sempre sem
    // avisar nada (nem QR, nem erro). Encerra e cai na rotina de nova tentativa.
    const watchdog = setTimeout(() => {
      if (runtime.socket === socket && runtime.status === 'connecting') {
        socket.end(new Error('O servidor não conseguiu se conectar ao WhatsApp a tempo'));
      }
    }, CONNECT_TIMEOUT_MS);
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
        }, supabaseAdmin, tenantId, automationSink(tenantId));
      }
    });
    socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (runtime.socket !== socket) return; // evento atrasado de uma conexão antiga
      if (qr || connection === 'open' || connection === 'close') clearTimeout(watchdog);

      if (qr) {
        runtime.qrCode = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
        runtime.status = 'qr';
        runtime.lastError = null;
      }

      if (connection === 'open') {
        runtime.status = 'connected';
        runtime.qrCode = null;
        runtime.lastError = null;
        runtime.failures = 0;
        runtime.wantsQr = false;
        runtime.phone = socket.user?.id?.split(':')[0] ?? null;
      }

      if (connection === 'close') {
        const wasShowingQr = runtime.status === 'qr';
        const { code, message } = disconnectInfo(lastDisconnect?.error);
        runtime.socket = null;
        runtime.qrCode = null;
        runtime.status = 'disconnected';
        runtime.phone = null;
        console.warn('[whatsapp-web] Conexão fechada', tenantId, code, message);

        // Logo depois de ler o QR o WhatsApp pede para reconectar: é o normal.
        if (code === DisconnectReason.restartRequired) {
          runtime.status = 'connecting';
          restartLater(tenantId, 500);
          return;
        }

        if (code === DisconnectReason.connectionReplaced) {
          runtime.wantsQr = false;
          runtime.lastError = 'Este número foi aberto em outro lugar (outro servidor ou outra instalação do sistema). Clique em Gerar QR Code para trazer a conexão de volta para cá.';
          return;
        }

        if (code !== undefined && DEAD_SESSION_CODES.has(code)) {
          await clearSession(tenantId);
          if (runtime.wantsQr) {
            // Quem pediu o QR está esperando: abre uma sessão limpa na hora.
            runtime.status = 'connecting';
            restartLater(tenantId, 500);
            return;
          }
          runtime.lastError = code === DisconnectReason.loggedOut
            ? 'O WhatsApp foi desconectado pelo celular. Gere um novo QR Code.'
            : `O WhatsApp recusou a sessão salva (código ${code}). Gere um novo QR Code.`;
          return;
        }

        // QR Code mostrado e ninguém leu: para de gerar até alguém pedir de novo.
        if (wasShowingQr && !socket.authState.creds.registered) {
          runtime.wantsQr = false;
          runtime.lastError = 'O QR Code expirou sem ser lido. Clique em Gerar QR Code de novo.';
          return;
        }

        runtime.failures += 1;
        if (runtime.failures >= (runtime.wantsQr ? MAX_FAILURES.waitingQr : MAX_FAILURES.background)) {
          runtime.wantsQr = false;
          runtime.lastError = `Não foi possível falar com o WhatsApp${code ? ` (código ${code})` : ''}${message ? `: ${message}` : ''}. Tente de novo em alguns minutos.`;
          return;
        }
        runtime.status = 'connecting';
        restartLater(tenantId, Math.min(2_000 * 2 ** (runtime.failures - 1), 30_000));
      }
    });
  })().catch((error) => {
    runtime.socket = null;
    runtime.status = 'disconnected';
    runtime.lastError = `Falha ao iniciar o WhatsApp Web: ${error instanceof Error ? error.message : String(error)}`;
    throw error;
  }).finally(() => {
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
    lastError: runtime.lastError,
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

/**
 * Avisos de lead novo / mensagem recebida: integrações de saída,
 * automações e respostas de campanhas. O motor é importado sob demanda (ele também usa este arquivo).
 */
function automationSink(tenantId: string) {
  let isNewContact = false;
  return {
    leadCreated: (lead: Record<string, unknown>) => {
      isNewContact = true;
      emitIntegrationEvent(tenantId, 'lead.created', leadEventData(lead, 'whatsapp'));
      import('@/lib/automations/engine').then(({ fireAutomation, onLeadCreated }) => fireAutomation(onLeadCreated, tenantId, String(lead.id), 'whatsapp'));
    },
    messageReceived: (data: Record<string, unknown>) => {
      emitIntegrationEvent(tenantId, 'message.received', data);
      import('@/lib/automations/engine').then(({ fireAutomation, onInboundMessage }) =>
        fireAutomation(onInboundMessage, tenantId, String(data.lead_id), String(data.text || ''), { isNewContact }));
      // Resposta a uma campanha (Disparos): roteamento, etiqueta, automação e pedido para sair.
      import('@/services/disparos.service').then(({ handleCampaignReply }) =>
        handleCampaignReply(tenantId, String(data.lead_id), String(data.phone || ''), String(data.text || '')).catch((error) => console.error('[disparos] resposta', error)));
    },
  };
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
  kind: 'image' | 'document' | 'audio' | 'video',
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

  if (kind === 'video') {
    return socket.sendMessage(jid, { video: buffer, caption: options.caption, mimetype: options.mimetype });
  }

  return socket.sendMessage(jid, {
    document: buffer,
    mimetype: options.mimetype,
    fileName: options.fileName || 'arquivo',
    caption: options.caption,
  });
}

/** Mostra "digitando..." para o contato (as automações usam antes de responder). */
export async function sendWhatsAppWebTyping(tenantId: string, phone: string) {
  const socket = await ensureConnectedSocket(tenantId);
  await socket.sendPresenceUpdate('composing', toWhatsAppJid(phone)).catch(() => {});
}

export async function disconnectWhatsAppWeb(tenantId: string) {
  const runtime = runtimeFor(tenantId);
  const socket = runtime.socket;
  runtime.socket = null; // os eventos de "fechou" desta conexão passam a ser ignorados
  runtime.status = 'disconnected';
  runtime.qrCode = null;
  runtime.phone = null;
  runtime.lastError = null;
  runtime.wantsQr = false;
  if (socket) {
    // Se a conexão já tinha caído, o logout falha -- mas a sessão sai mesmo assim.
    await socket.logout().catch(() => socket.end(undefined));
  }
  // Sem apagar as credenciais, o próximo QR Code não aparece.
  await clearSession(tenantId);
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
