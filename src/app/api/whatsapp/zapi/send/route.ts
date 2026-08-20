/**
 * ============================================================
 * VTEC OS — Rota de Envio: Z-API Gateway (WhatsApp)
 * ============================================================
 *
 * POST /api/whatsapp/zapi/send
 *
 * Permite enviar mensagens via Z-API sem depender diretamente
 * da função server-side. As credenciais Z-API são lidas do
 * Supabase (tabela integrations_config) ou das env vars.
 *
 * Body JSON:
 * {
 *   "phone":          "5511999887766",  // Telefone do destinatário
 *   "message":        "Olá!",           // Texto da mensagem
 *   "leadId":         "uuid-do-lead",   // (opcional) para histórico
 *   "delayMessage":   1000,             // (opcional) delay em ms
 *   "delayTyping":    2000,             // (opcional) delay de digitação em ms
 * }
 *
 * Retorno:
 * {
 *   "success": true,
 *   "messageId": "wamid.xxx",
 *   "dbMessageId": "uuid"
 * }
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppWebStatus, sendWhatsAppWebMessage, startWhatsAppWeb } from '@/lib/whatsapp-web';

export async function POST(request: NextRequest) {
  let body: { phone?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  const { phone, message } = body;

  // Validação
  if (!phone || !message?.trim()) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: phone, message.' },
      { status: 400 }
    );
  }

  // Chama a função de envio Z-API (busca credenciais no Supabase)
  try {
    const result = await sendWhatsAppWebMessage(phone, message);
    return NextResponse.json({
      success: true,
      messageId: result?.key?.id ?? null,
      dbMessageId: null,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Falha no envio pelo WhatsApp Web.',
    }, { status: 502 });
  }
}

// ─── GET — Testa a conexão com Z-API ─────────────────────────
/**
 * GET /api/whatsapp/zapi/send
 * Verifica se as credenciais Z-API estão configuradas e retorna status.
 */
export async function GET() {
  await startWhatsAppWeb();
  const status = getWhatsAppWebStatus();
  return NextResponse.json({ configured: status.connected, source: 'whatsapp-web', ...status });
}
