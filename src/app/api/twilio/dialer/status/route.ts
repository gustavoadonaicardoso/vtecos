import { handleCallStatus } from '@/lib/dialer/engine';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

/** Discador automático: a ligação terminou (não atendeu, ocupado, falhou, encerrada). */
export async function POST(request: Request) {
  const { valid, params, tenantId } = await verifyTwilioRequest(request);
  if (!valid || !tenantId) return twilioRejectResponse();
  try {
    await handleCallStatus(tenantId, new URL(request.url).searchParams.get('contact'), params);
  } catch (error) {
    console.error('[discador] erro no aviso de status:', error);
  }
  return new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}
