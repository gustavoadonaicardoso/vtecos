import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { createCampaign, isDialerManager, listCampaigns } from '@/services/dialer.service';

const FORBIDDEN = 'Só administradores e gerentes gerenciam as campanhas do Discador.';

export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (!isDialerManager(auth.profile.role)) return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  try {
    return NextResponse.json({ data: await listCampaigns(auth.tenantId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar as campanhas.' }, { status: 500 });
  }
}

/** Nova campanha a partir da planilha (o navegador lê o arquivo e manda as linhas). */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm', permission: 'leads.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (!isDialerManager(auth.profile.role)) return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  const result = await createCampaign(auth.tenantId, auth.profile, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result }, { status: 201 });
}
