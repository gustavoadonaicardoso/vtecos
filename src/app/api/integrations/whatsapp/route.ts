import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdminProfile } from '@/lib/session';
import { completeEmbeddedSignup, signupClientConfig } from '@/services/whatsapp-signup.service';

/** WhatsApp oficial: dados públicos para abrir o "Conectar com Facebook". */
export async function GET() {
  const auth = await requireAdminProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: signupClientConfig() });
}

/** Conclui o cadastro incorporado: código + IDs que o Facebook devolveu ao navegador. */
export async function POST(request: Request) {
  const auth = await requireAdminProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const body = await request.json().catch(() => ({}));
  const result = await completeEmbeddedSignup(auth.tenantId, body);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  await logAudit({ id: auth.profile.id, name: auth.profile.name }, 'SETTINGS_UPDATE', `Conectou o WhatsApp oficial pelo Facebook (${result.displayPhone || 'número'}).`, 'integration', 'whatsapp_meta', supabaseAdmin, auth.tenantId);
  return NextResponse.json({ data: result });
}
