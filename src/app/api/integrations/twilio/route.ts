import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminProfile } from '@/lib/session';
import { connectTwilio, disconnectTwilio, listTwilioNumbers } from '@/services/twilio-connect.service';

/**
 * Discador: conectar a conta Twilio da empresa (só administradores).
 * action "numbers": confere SID e token e lista os números da conta.
 * action "connect": cria chave de API e TwiML App na conta e salva.
 */
export async function POST(request: Request) {
  const auth = await requireAdminProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  if (body.action === 'numbers') {
    const result = await listTwilioNumbers(body.accountSid, body.authToken);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result });
  }
  if (body.action === 'connect') {
    const result = await connectTwilio(auth.tenantId, body);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', `Conectou o Discador (Twilio) com o número ${result.phoneNumber}.`, 'integration', 'twilio', supabaseAdmin, auth.tenantId);
    return NextResponse.json({ data: result });
  }
  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}

export async function DELETE() {
  const auth = await requireAdminProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await disconnectTwilio(auth.tenantId);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
  await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', 'Desconectou o Discador (Twilio).', 'integration', 'twilio', supabaseAdmin, auth.tenantId);
  return NextResponse.json({ success: true });
}
