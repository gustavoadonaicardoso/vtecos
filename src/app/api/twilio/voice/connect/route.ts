import { NextResponse } from 'next/server';
import { profileIdFromTwilioIdentity, twilioService } from '@/services/twilio.service';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

export async function POST(request: Request) {
  try {
    const { valid, params } = await verifyTwilioRequest(request);
    if (!valid) return twilioRejectResponse();

    const to = params.To;
    const identity = params.ApplicationSid ? params.From : null;
    const callSid = params.CallSid;

    // Registra a ligação na empresa de quem ligou (identidade = id do perfil).
    const profileId = profileIdFromTwilioIdentity(identity);
    const { data: caller } = profileId
      // tenant-scope: ok (descobre a empresa a partir do perfil que ligou)
      ? await supabase.from('profiles').select('id, tenant_id').eq('id', profileId).maybeSingle()
      : { data: null };

    if (to && callSid && caller?.tenant_id) {
      await supabase.from('call_logs').insert([{
        tenant_id: caller.tenant_id,
        user_id: caller.id,
        contact_number: to,
        direction: 'outbound',
        status: 'in-progress',
        call_sid: callSid
      }]);
    }

    const twiml = twilioService.generateDialTwiML(to);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Twilio Connect Error:', error);
    return new NextResponse('<Response><Say>Erro na conexão.</Say></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
