/**
 * ============================================================
 * VTEC OS — Rota de Envio: WhatsApp Business Cloud API (Meta)
 * ============================================================
 *
 * POST /api/whatsapp/send
 *
 * Body JSON:
 * {
 *   "phone":    "5511999887766",     // Telefone do destinatário
 *   "type":     "text",              // text | template | image | video | document | audio | buttons | list
 *   "leadId":   "uuid-do-lead",      // (opcional) para salvar no histórico
 *
 *   // Para type = "text":
 *   "text": "Olá, tudo bem?",
 *
 *   // Para type = "template":
 *   "template": "nome_do_template",
 *   "language": "pt_BR",
 *   "components": [...],             // (opcional)
 *
 *   // Para type = "image" | "video" | "document":
 *   "url": "https://exemplo.com/arquivo.pdf",
 *   "caption": "Legenda opcional",
 *   "filename": "contrato.pdf",      // (somente document)
 *
 *   // Para type = "buttons":
 *   "bodyText": "Deseja continuar?",
 *   "buttons": [{ "id": "sim", "title": "Sim" }, { "id": "nao", "title": "Não" }],
 *   "header": "Atenção",            // (opcional)
 *   "footer": "Responda abaixo",    // (opcional)
 *
 *   // Para type = "list":
 *   "bodyText": "Escolha uma opção",
 *   "buttonLabel": "Ver opções",
 *   "sections": [{ "title": "Suporte", "rows": [{ "id": "s1", "title": "Técnico" }] }],
 * }
 *
 * Retorno:
 * {
 *   "success": true,
 *   "messageId": "wamid.xxx",       // ID da mensagem na Meta
 *   "dbMessageId": "uuid"           // ID salvo no Supabase (se leadId informado)
 * }
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WhatsAppService, getWhatsAppConfig } from '@/lib/whatsapp';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  const { phone, type, leadId, text, template, language, components,
          url, caption, filename, bodyText, buttons, buttonLabel,
          sections, header, footer } = body;

  // Validação básica
  if (!phone || !type) {
    return NextResponse.json({ error: 'Campos obrigatórios: phone, type.' }, { status: 400 });
  }

  const supabase = getSupabase();
  let service: WhatsAppService;

  try {
    const config = await getWhatsAppConfig(supabase);
    service = new WhatsAppService(config);
  } catch (err: any) {
    return NextResponse.json({
      error: 'Configuração WhatsApp incompleta.',
      details: err.message,
    }, { status: 503 });
  }

  // 1. Persiste mensagem no banco com status 'sending' (antes de enviar)
  let dbMessageId: string | null = null;
  if (leadId) {
    const messageText = text || (template ? `[Template: ${template}]` : '') || url || bodyText || '';
    const { data: msg, error: msgErr } = await supabase
      .from('chat_messages')
      .insert([{
        lead_id: leadId,
        text: messageText,
        sent_by_me: true,
        type: type === 'text' ? 'text' : (type === 'audio' ? 'audio' : type),
        status: 'sending',
        provider: 'meta',
      }])
      .select('id')
      .single();

    if (!msgErr && msg) {
      dbMessageId = msg.id;
    }
  }

  // 2. Envia via Meta Cloud API
  let result: Awaited<ReturnType<WhatsAppService['sendText']>>;

  try {
    switch (type) {
      case 'text':
        if (!text) return NextResponse.json({ error: '"text" é obrigatório para type=text.' }, { status: 400 });
        result = await service.sendText(phone, text);
        break;

      case 'template':
        if (!template) return NextResponse.json({ error: '"template" é obrigatório para type=template.' }, { status: 400 });
        result = await service.sendTemplate(phone, template, language ?? 'pt_BR', components);
        break;

      case 'image':
        if (!url) return NextResponse.json({ error: '"url" é obrigatório para type=image.' }, { status: 400 });
        result = await service.sendImage(phone, url, caption);
        break;

      case 'video':
        if (!url) return NextResponse.json({ error: '"url" é obrigatório para type=video.' }, { status: 400 });
        result = await service.sendVideo(phone, url, caption);
        break;

      case 'document':
        if (!url || !filename) return NextResponse.json({ error: '"url" e "filename" são obrigatórios para type=document.' }, { status: 400 });
        result = await service.sendDocument(phone, url, filename, caption);
        break;

      case 'audio':
        if (!url) return NextResponse.json({ error: '"url" é obrigatório para type=audio.' }, { status: 400 });
        result = await service.sendAudio(phone, url);
        break;

      case 'buttons':
        if (!bodyText || !buttons?.length) return NextResponse.json({ error: '"bodyText" e "buttons" são obrigatórios para type=buttons.' }, { status: 400 });
        result = await service.sendButtons(phone, bodyText, buttons, { header, footer });
        break;

      case 'list':
        if (!bodyText || !buttonLabel || !sections?.length) return NextResponse.json({ error: '"bodyText", "buttonLabel" e "sections" são obrigatórios para type=list.' }, { status: 400 });
        result = await service.sendList(phone, bodyText, buttonLabel, sections, { header, footer });
        break;

      default:
        return NextResponse.json({ error: `Tipo de mensagem não suportado: "${type}".` }, { status: 400 });
    }
  } catch (err: any) {
    // Atualiza status para 'failed' se havia registro
    if (dbMessageId) {
      await supabase.from('chat_messages').update({ status: 'failed' }).eq('id', dbMessageId);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // 3. Atualiza status no banco
  if (dbMessageId) {
    await supabase
      .from('chat_messages')
      .update({
        status: result.success ? 'sent' : 'failed',
        external_id: result.success ? (result as any).messageId : undefined,
      })
      .eq('id', dbMessageId);
  }

  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: result.error,
      details: result.data,
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    messageId: (result as any).messageId,
    dbMessageId,
  }, { status: 200 });
}
