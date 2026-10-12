import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { automationAccounts } from '@/services/email.service';

export const runtime = 'nodejs';

// GET -- caixas da empresa para o bloco "Enviar e-mail" do editor de Automações.
export async function GET() {
  const auth = await requireActiveProfile({ module: 'email', permission: 'automations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await automationAccounts(auth.tenantId) });
}
