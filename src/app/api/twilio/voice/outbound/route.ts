import { NextResponse } from 'next/server';
import { twilioService } from '@/services/twilio.service';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

export async function POST(request: Request) {
  const { valid } = await verifyTwilioRequest(request);
  if (!valid) return twilioRejectResponse();

  const { searchParams } = new URL(request.url);
  const to = searchParams.get('to');

  if (!to) {
    return new NextResponse('<Response><Say>Número não encontrado.</Say></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const twiml = twilioService.generateDialTwiML(to);

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

// Suporte a GET (a Twilio pode ser configurada pra chamar via GET); a
// assinatura ainda é validada dentro de verifyTwilioRequest.
export async function GET(request: Request) {
  return POST(request);
}
