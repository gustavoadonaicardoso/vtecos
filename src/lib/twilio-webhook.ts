import twilio from 'twilio';

const authToken = process.env.TWILIO_AUTH_TOKEN;

/**
 * Valida que a requisição realmente veio da Twilio (assinatura HMAC no
 * header X-Twilio-Signature), não de alguém forjando um POST pro
 * webhook. A URL usada pra assinar tem que ser a URL pública exata --
 * atrás do Nginx, request.url costuma vir com o host interno, então
 * reconstruímos a partir de NEXT_PUBLIC_APP_URL (mesma env var já usada
 * pra montar as callback URLs enviadas à Twilio).
 */
export async function verifyTwilioRequest(
  request: Request
): Promise<{ valid: boolean; params: Record<string, string> }> {
  if (!authToken) return { valid: false, params: {} };

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

  const valid = twilio.validateRequest(authToken, signature, fullUrl, params);
  return { valid, params };
}

export function twilioRejectResponse() {
  return new Response('<Response><Reject/></Response>', {
    status: 403,
    headers: { 'Content-Type': 'text/xml' },
  });
}
