import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireActiveProfile } from '@/lib/session';
import { NOT_CONNECTED, placeCall, twilioConfigFor } from '@/lib/twilio-tenant';

export async function POST(request: Request) {
  try {
    const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
    }

    const { to, agentId } = await request.json();
    if (!to) {
      return NextResponse.json({ error: 'Informe o número.' }, { status: 400 });
    }

    const config = await twilioConfigFor(auth.tenantId);
    if (!config) return NextResponse.json({ error: NOT_CONNECTED }, { status: 409 });

    // Com agentId, a ligação atendida é passada para o usuário no navegador.
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const twimlUrl = agentId
      ? `${appUrl}/api/twilio/voice/agent?agentId=${encodeURIComponent(agentId)}`
      : `${appUrl}/api/twilio/voice/outbound?to=${encodeURIComponent(to)}`;

    const call = await placeCall(config, to, twimlUrl);

    // Sempre com o id da sessão, nunca de um userId enviado pelo navegador.
    await supabase.from('call_logs').insert([{
      tenant_id: auth.tenantId,
      user_id: auth.profile.id,
      contact_number: to,
      direction: 'outbound',
      status: 'queued',
      call_sid: call.sid,
    }]);

    return NextResponse.json({ success: true, callSid: call.sid });
  } catch (error: unknown) {
    console.error('Call API Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
