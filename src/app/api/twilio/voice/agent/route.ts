import { NextResponse } from 'next/server';
import { twilioService } from '@/services/twilio.service';

export async function POST(request: Request) {
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
