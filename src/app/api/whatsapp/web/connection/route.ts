import { NextResponse } from 'next/server';
import { requireActiveProfile, requireAdminProfile } from '@/lib/session';
import {
  disconnectWhatsAppWeb,
  getWhatsAppWebStatus,
  requestWhatsAppWebQr,
} from '@/lib/whatsapp-web';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cada empresa liga o PRÓPRIO WhatsApp Web (QR Code em Integrações).
// Antes esta rota não exigia login: qualquer pessoa podia ver o QR ou
// desconectar o WhatsApp da empresa.

/** Só lê a situação (a tela consulta a cada 2s enquanto espera o QR). */
export async function GET() {
  // permission: open (só a situação da conexão; conectar e desconectar é de admin)
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const status = getWhatsAppWebStatus(auth.tenantId);
  // Só administradores veem o QR Code (quem escaneia controla o número).
  return NextResponse.json(auth.profile.role === 'ADMIN' ? status : { ...status, qrCode: null });
}

/** "Gerar QR Code": liga a sessão da empresa (ou devolve o QR que já está na tela). */
export async function POST() {
  const auth = await requireAdminProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    await requestWhatsAppWebQr(auth.tenantId);
    return NextResponse.json(getWhatsAppWebStatus(auth.tenantId));
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
