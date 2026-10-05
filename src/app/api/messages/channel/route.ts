import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { whatsappChannels } from '@/services/conversations.service';

export const runtime = 'nodejs';

/** Qual WhatsApp está pronto para enviar (a tela avisa quando nenhum está). */
export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await whatsappChannels(auth.tenantId) });
}
