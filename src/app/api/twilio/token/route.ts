import { NextResponse } from 'next/server';
import { twilioService } from '@/services/twilio.service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const identity = searchParams.get('identity') || 'user_' + Math.random().toString(36).substring(7);

    const token = twilioService.generateToken(identity);

    return NextResponse.json({ token, identity });
  } catch (error: any) {
    console.error('Twilio Token Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
