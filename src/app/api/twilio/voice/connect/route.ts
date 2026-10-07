import { NextResponse } from 'next/server';
import { profileIdFromTwilioIdentity } from '@/services/twilio.service';
import { dialNumberTwiml } from '@/lib/twilio-tenant';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { verifyTwilioRequest, twilioRejectResponse } from '@/lib/twilio-webhook';
import { toE164 } from '@/lib/dialer/phone';

/** Ligação feita pelo navegador (TwiML App da empresa): disca com o número da empresa. */
export async function POST(request: Request) {
  try {
    const { valid, params, tenantId, config } = await verifyTwilioRequest(request);
    if (!valid || !tenantId) return twilioRejectResponse();

    // Só número de telefone (nada de SIP ou outro usuário), no formato +55...
    const to = toE164(params.To);
    if (!to) {
      return new NextResponse('<Response><Say language="pt-BR">Número inválido. Confira o DDD e o número.</Say></Response>', { headers: { 'Content-Type': 'text/xml' } });
    }
    const identity = params.ApplicationSid ? params.From : null;
    const callSid = params.CallSid;

    // Registra na empresa da conta Twilio, se quem ligou é dela.
    const profileId = profileIdFromTwilioIdentity(identity);
    const { data: caller } = profileId
      ? await supabase.from('profiles').select('id').eq('tenant_id', tenantId).eq('id', profileId).maybeSingle()
      : { data: null };

    if (to && callSid && caller) {
      await supabase.from('call_logs').insert([{
        tenant_id: tenantId,
        user_id: caller.id,
        contact_number: to,
        direction: 'outbound',
        status: 'in-progress',
        call_sid: callSid,
      }]);
    }

    return new NextResponse(dialNumberTwiml(to, config?.phoneNumber), {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Twilio Connect Error:', error);
    return new NextResponse('<Response><Say>Erro na conexão.</Say></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
