import { NextResponse } from 'next/server';
import { twilioService } from '@/services/twilio.service';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const to = formData.get('To') as string;
    const identity = formData.get('ApplicationSid') ? formData.get('From') : null; // Usually identity is in From for client calls
    const callSid = formData.get('CallSid') as string;
    const identityStr = identity as string | null;

    // Log the call
    if (to && callSid) {
      await supabase.from('call_logs').insert([{
        user_id: identityStr?.startsWith('user_') ? null : identityStr, // This needs proper mapping
        contact_number: to,
        direction: 'outbound',
        status: 'in-progress',
        call_sid: callSid
      }]);
    }

    const twiml = twilioService.generateDialTwiML(to);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Twilio Connect Error:', error);
    return new NextResponse('<Response><Say>Erro na conexão.</Say></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
