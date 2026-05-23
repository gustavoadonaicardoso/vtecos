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
import { sendWhatsApp } from '@/lib/zapi';

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  const { phone, message, leadId, delayMessage, delayTyping } = body;

  // Validação
  if (!phone || !message?.trim()) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: phone, message.' },
      { status: 400 }
    );
  }

  // Chama a função de envio Z-API (busca credenciais no Supabase)
  const result = await sendWhatsApp(phone, message, leadId, {
    delayMessage: delayMessage ?? 0,
    delayTyping: delayTyping ?? 0,
  });

  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: result.error,
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    messageId: result.data?.messageId ?? null,
    dbMessageId: result.dbMessageId ?? null,
  }, { status: 200 });
}

// ─── GET — Testa a conexão com Z-API ─────────────────────────
/**
 * GET /api/whatsapp/zapi/send
 * Verifica se as credenciais Z-API estão configuradas e retorna status.
 */
export async function GET() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verifica credenciais no Supabase
  const { data: item, error } = await supabase
    .from('integrations_config')
    .select('config')
    .eq('provider', 'zapi')
    .maybeSingle();

  if (error || !item) {
    // Fallback: verifica env vars
    const hasEnvVars = !!(
      process.env.ZAPI_INSTANCE_ID &&
      process.env.ZAPI_TOKEN
    );
    return NextResponse.json({
      configured: hasEnvVars,
      source: hasEnvVars ? 'env' : 'none',
      message: hasEnvVars
        ? 'Credenciais Z-API encontradas nas variáveis de ambiente.'
        : 'Z-API não configurada. Configure via Integrações ou .env.local.',
    });
  }

  const config = item.config as any;
  return NextResponse.json({
    configured: !!(config.instanceId && config.token),
    source: 'database',
    instanceId: config.instanceId ? `${String(config.instanceId).slice(0, 4)}****` : null,
    message: 'Credenciais Z-API carregadas do banco de dados.',
  });
}
