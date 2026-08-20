import { NextResponse } from 'next/server';
import { twilioService } from '@/services/twilio.service';

export async function POST(request: Request) {
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

// Support GET for easier debugging/Twilio setup if needed
export async function GET(request: Request) {
  return POST(request);
}
