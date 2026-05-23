import { NextResponse } from 'next/server';
import { twilioService } from '@/services/twilio.service';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { to, userId, agentId } = await request.json();

    if (!to || !userId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Generate TwiML URL or instruction
    // If agentId is provided, we connect the call to the agent once the contact answers
    const twimlUrl = agentId 
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/agent?agentId=${encodeURIComponent(agentId)}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/outbound?to=${encodeURIComponent(to)}`;

    // 2. Make the call via Twilio SDK
    const call = await twilioService.makeCall(to, process.env.TWILIO_PHONE_NUMBER!, twimlUrl);

    // 3. Log the call in Supabase
    await supabase.from('call_logs').insert([{
      user_id: userId,
      contact_number: to,
      direction: 'outbound',
      status: 'queued',
      call_sid: call.sid
    }]);

    return NextResponse.json({ success: true, callSid: call.sid });
  } catch (error: any) {
    console.error('Call API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
