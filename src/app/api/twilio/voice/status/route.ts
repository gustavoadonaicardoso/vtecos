import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;
    const status = formData.get('CallStatus') as string;
    const duration = formData.get('RecordingDuration') as string;

    if (callSid && recordingUrl) {
      // Update the call log with the recording URL
      await supabase
        .from('call_logs')
        .update({ 
          recording_url: recordingUrl,
          duration: duration ? parseInt(duration) : 0,
          status: status || 'completed'
        })
        .eq('call_sid', callSid);
    }

    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Twilio Status Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
