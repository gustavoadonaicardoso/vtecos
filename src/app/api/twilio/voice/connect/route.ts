import { NextResponse } from 'next/server';
import { twilioService } from '@/services/twilio.service';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

export async function POST(request: Request) {
  try {
    const { valid, params } = await verifyTwilioRequest(request);
    if (!valid) return twilioRejectResponse();

    const to = params.To;
    const identity = params.ApplicationSid ? params.From : null;
    const callSid = params.CallSid;

    // Log the call
    if (to && callSid) {
      await supabase.from('call_logs').insert([{
        user_id: identity?.startsWith('user_') ? null : identity, // This needs proper mapping
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
