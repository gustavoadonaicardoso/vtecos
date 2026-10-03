import { NextResponse } from 'next/server';
import { requireActiveProfile, requireAdminProfile } from '@/lib/session';
import {
  disconnectWhatsAppWeb,
  getWhatsAppWebStatus,
  startWhatsAppWeb,
} from '@/lib/whatsapp-web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cada empresa liga o PRÓPRIO WhatsApp Web (QR Code em Integrações).
// Antes esta rota não exigia login: qualquer pessoa podia ver o QR ou
// desconectar o WhatsApp da empresa.

export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    await startWhatsAppWeb(auth.tenantId);
    const status = getWhatsAppWebStatus(auth.tenantId);
    // Só administradores veem o QR Code (quem escaneia controla o número).
    return NextResponse.json(auth.profile.role === 'ADMIN' ? status : { ...status, qrCode: null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao iniciar o WhatsApp Web.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const auth = await requireAdminProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    await disconnectWhatsAppWeb(auth.tenantId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao desconectar o WhatsApp Web.' },
      { status: 500 }
    );
  }
}
