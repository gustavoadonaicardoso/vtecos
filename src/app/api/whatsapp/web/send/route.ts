import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppWebMessage } from '@/lib/whatsapp-web';
import { requireActiveProfile } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Envio pelo número da empresa: exige usuário logado. Antes era aberta (o
 * Totem público usava) -- qualquer pessoa podia mandar mensagem pelo
 * WhatsApp da empresa. As mensagens da fila agora saem do servidor.
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  try {
    const { phone, message } = await request.json();
    if (!phone || !message?.trim()) {
      return NextResponse.json({ error: 'Campos obrigatórios: phone, message.' }, { status: 400 });
    }

    const result = await sendWhatsAppWebMessage(phone, message.trim());
    return NextResponse.json({ success: true, messageId: result?.key?.id ?? null });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Falha no envio.' },
      { status: 503 }
    );
  }
}
