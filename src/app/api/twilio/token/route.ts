import { NextResponse } from 'next/server';
import { twilioIdentity } from '@/services/twilio.service';
import { NOT_CONNECTED, twilioConfigFor, voiceToken } from '@/lib/twilio-tenant';
import { requireActiveProfile } from '@/lib/session';

/**
 * Token do discador no navegador, sempre com a identidade real do usuário
 * logado e a conta Twilio DA EMPRESA dele (conectada em Integrações).
 * Ligações feitas com o token são cobradas nessa conta.
 */
export async function GET() {
  try {
    const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const config = await twilioConfigFor(auth.tenantId);
    if (!config) return NextResponse.json({ error: NOT_CONNECTED, code: 'not_connected' }, { status: 409 });

    const identity = twilioIdentity(auth.profile.id);
    return NextResponse.json({ token: voiceToken(config, identity), identity, phoneNumber: config.phoneNumber });
  } catch (error: unknown) {
    console.error('Twilio Token Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
