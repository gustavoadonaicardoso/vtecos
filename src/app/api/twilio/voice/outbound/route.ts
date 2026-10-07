import { NextResponse } from 'next/server';
import { dialNumberTwiml } from '@/lib/twilio-tenant';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';

export async function POST(request: Request) {
  const { valid, config } = await verifyTwilioRequest(request);
  if (!valid) return twilioRejectResponse();

  const to = new URL(request.url).searchParams.get('to');
  if (!to) {
    return new NextResponse('<Response><Say>Número não encontrado.</Say></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  return new NextResponse(dialNumberTwiml(to, config?.phoneNumber), {
    headers: { 'Content-Type': 'text/xml' },
  });
}

// Suporte a GET (a Twilio pode ser configurada pra chamar via GET); a
// assinatura ainda é validada dentro de verifyTwilioRequest.
export async function GET(request: Request) {
  return POST(request);
}
