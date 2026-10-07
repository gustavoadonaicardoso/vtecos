import { HANGUP, handleBridge } from '@/lib/dialer/engine';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

const xml = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/xml' } });

/** Discador automático: terminou a conversa com o atendente (ou ele não atendeu). */
export async function POST(request: Request) {
  const { valid, params, tenantId } = await verifyTwilioRequest(request);
  if (!valid || !tenantId) return twilioRejectResponse();
  const query = new URL(request.url).searchParams;
  try {
    return xml(await handleBridge(tenantId, query.get('contact'), query.get('agent'), params));
  } catch (error) {
    console.error('[discador] erro no fim da ligação:', error);
    return xml(HANGUP());
  }
}
