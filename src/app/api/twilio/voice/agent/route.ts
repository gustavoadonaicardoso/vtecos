import { dialAgentTwiml } from '@/lib/twilio-tenant';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

export async function POST(request: Request) {
  const { valid } = await verifyTwilioRequest(request);
  if (!valid) return twilioRejectResponse();

  const agentId = new URL(request.url).searchParams.get('agentId');
  if (!agentId) {
    return new Response('Missing agentId', { status: 400 });
  }

  return new Response(dialAgentTwiml(agentId), {
    headers: { 'Content-Type': 'text/xml' },
  });
}
