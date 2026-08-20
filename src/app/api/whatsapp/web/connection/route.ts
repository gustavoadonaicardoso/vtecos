import { NextResponse } from 'next/server';
import {
  disconnectWhatsAppWeb,
  getWhatsAppWebStatus,
  startWhatsAppWeb,
} from '@/lib/whatsapp-web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await startWhatsAppWeb();
    return NextResponse.json(getWhatsAppWebStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao iniciar o WhatsApp Web.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await disconnectWhatsAppWeb();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao desconectar o WhatsApp Web.' },
      { status: 500 }
    );
  }
}
