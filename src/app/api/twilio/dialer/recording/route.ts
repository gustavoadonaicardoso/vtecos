import { handleRecording } from '@/lib/dialer/engine';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

/** Discador automático: gravação da conversa pronta. */
export async function POST(request: Request) {
  const { valid, params, tenantId } = await verifyTwilioRequest(request);
  if (!valid || !tenantId) return twilioRejectResponse();
  try {
    await handleRecording(tenantId, new URL(request.url).searchParams.get('contact'), params);
  } catch (error) {
    console.error('[discador] erro na gravação:', error);
  }
  return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}
