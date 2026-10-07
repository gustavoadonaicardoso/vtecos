import twilio from 'twilio';
import { tenantByAccountSid, type TwilioConfig } from '@/lib/twilio-tenant';

/**
 * Valida que a requisição realmente veio da Twilio (assinatura HMAC no
 * header X-Twilio-Signature), não de alguém forjando um POST pro
 * webhook. A URL usada pra assinar tem que ser a URL pública exata --
 * atrás do Nginx, request.url costuma vir com o host interno, então
 * reconstruímos a partir de NEXT_PUBLIC_APP_URL (mesma env var já usada
 * pra montar as callback URLs enviadas à Twilio).
 *
 * Cada empresa tem a própria conta Twilio: o AccountSid que vem no
 * aviso diz de qual empresa ele é, e a assinatura é conferida com o
 * Auth Token DESSA conta.
 */
export async function verifyTwilioRequest(
  request: Request
): Promise<{ valid: boolean; params: Record<string, string>; tenantId: string | null; config: TwilioConfig | null }> {
  const signature = request.headers.get('x-twilio-signature') || '';
  const reqUrl = new URL(request.url);
  const publicOrigin = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const fullUrl = `${publicOrigin}${reqUrl.pathname}${reqUrl.search}`;

  const params: Record<string, string> = {};
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        params[key] = String(value);
      });
    }
  }

  const accountSid = params.AccountSid || reqUrl.searchParams.get('AccountSid') || '';
  const owner = accountSid ? await tenantByAccountSid(accountSid) : null;
  if (!owner || !signature) return { valid: false, params, tenantId: null, config: null };

  const valid = twilio.validateRequest(owner.config.authToken, signature, fullUrl, params);
  return valid ? { valid, params, tenantId: owner.tenantId, config: owner.config } : { valid: false, params, tenantId: null, config: null };
}

export function twilioRejectResponse() {
  return new Response('<Response><Reject/></Response>', {
    status: 403,
    headers: { 'Content-Type': 'text/xml' },
  });
}
