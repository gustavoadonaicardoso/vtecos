import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { recordingFor } from '@/services/dialer.service';

/**
 * Gravação de uma ligação. A Twilio exige a senha da conta para baixar o
 * áudio, então o servidor busca com a conta da empresa e repassa.
 * ?contact=ID (campanha) ou ?log=ID (histórico); &download=1 baixa.
 */
export async function GET(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const query = new URL(request.url).searchParams;
  const found = await recordingFor(auth.tenantId, auth.profile, { contactId: query.get('contact'), logId: query.get('log') });
  if ('error' in found) return NextResponse.json({ error: found.error }, { status: 404 });

  const basic = Buffer.from(`${found.config.accountSid}:${found.config.authToken}`).toString('base64');
  const audio = await fetch(found.url, { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!audio || !audio.ok || !audio.body) return NextResponse.json({ error: 'A Twilio não entregou a gravação agora. Tente de novo em instantes.' }, { status: 502 });
  return new Response(audio.body, {
    headers: {
      'Content-Type': audio.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': `${query.get('download') ? 'attachment' : 'inline'}; filename="${found.fileName}.mp3"`,
    },
  });
}
