import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

export async function POST(request: Request) {
  try {
    const { valid, params, tenantId } = await verifyTwilioRequest(request);
    if (!valid || !tenantId) return twilioRejectResponse();

    const callSid = params.CallSid;
    const recordingUrl = params.RecordingUrl;
    const status = params.CallStatus;
    const duration = params.RecordingDuration;

    if (callSid && recordingUrl) {
      // Gravação pronta: guarda no registro da ligação da empresa dona da conta.
      await supabase
        .from('call_logs')
        .update({
          recording_url: recordingUrl,
          duration: duration ? parseInt(duration) : 0,
          status: status || 'completed'
        })
        .eq('tenant_id', tenantId)
        .eq('call_sid', callSid);
    }

    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Twilio Status Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
