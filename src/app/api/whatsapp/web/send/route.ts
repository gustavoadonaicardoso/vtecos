import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppWebMessage } from '@/lib/whatsapp-web';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
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
