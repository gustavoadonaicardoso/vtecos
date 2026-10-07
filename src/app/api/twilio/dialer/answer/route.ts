import { HANGUP, handleAnswer } from '@/lib/dialer/engine';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

const xml = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/xml' } });

/** Discador automático: o contato atendeu (ou caiu na caixa postal). */
export async function POST(request: Request) {
  const { valid, params, tenantId } = await verifyTwilioRequest(request);
  if (!valid || !tenantId) return twilioRejectResponse();
  try {
    return xml(await handleAnswer(tenantId, new URL(request.url).searchParams.get('contact'), params));
  } catch (error) {
    console.error('[discador] erro ao atender:', error);
    return xml(HANGUP());
  }
}
