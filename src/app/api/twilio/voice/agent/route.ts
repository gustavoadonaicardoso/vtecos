import { twilioService } from '@/services/twilio.service';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

export async function POST(request: Request) {
  const { valid } = await verifyTwilioRequest(request);
  if (!valid) return twilioRejectResponse();

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');

  if (!agentId) {
    return new Response('Missing agentId', { status: 400 });
  }

  const twiml = twilioService.generateAgentConnectTwiML(agentId);

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
