import { supabase } from '@/lib/supabase';

export interface CallLog {
  id: string;
  user_id: string;
  contact_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration?: number;
  recording_url?: string;
  created_at: string;
}

export async function saveCallLog(log: Omit<CallLog, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('call_logs')
    .insert([log])
    .select()
    .single();

  if (error) {
    console.error('Error saving call log:', error.message || error);
    return null;
  }
  return data;
}

export async function fetchCallHistory(userId: string) {
  try {
    const { data, error } = await supabase
      .from('call_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('relation "call_logs" does not exist')) {
        console.warn('⚠️ A tabela "call_logs" ainda não foi criada no Supabase. O histórico ficará vazio até que o SQL de criação seja executado.');
      } else {
        console.error('Error fetching call history:', error.message || error);
      }
      return [];
    }
    return data as CallLog[];
  } catch (err) {
    console.error('Unexpected error fetching history:', err);
    return [];
  }
}

export async function updateCallRecording(callSid: string, recordingUrl: string) {
  // Assuming we store call_sid in our logs to match back
  const { error } = await supabase
    .from('call_logs')
    .update({ recording_url: recordingUrl })
    .eq('call_sid', callSid);

  if (error) {
    console.error('Error updating call recording:', error);
  }
}
