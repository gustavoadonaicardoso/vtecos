import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

/** Ligação manual (discador flutuante) terminou: guarda o resultado e a duração. */
export async function POST(request: Request) {
  const { valid, params, tenantId } = await verifyTwilioRequest(request);
  if (!valid || !tenantId) return twilioRejectResponse();
  if (params.CallSid) {
    await supabase
      .from('call_logs')
      .update({ status: params.DialCallStatus || 'completed', duration: Number(params.DialCallDuration) || 0 })
      .eq('tenant_id', tenantId)
      .eq('call_sid', params.CallSid);
  }
  return new Response('<Response><Hangup/></Response>', { headers: { 'Content-Type': 'text/xml' } });
}
