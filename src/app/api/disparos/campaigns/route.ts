import { NextRequest, NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { fetchCampaigns, createCampaign } from '@/services/disparos.service';

export async function GET() {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await fetchCampaigns(auth.tenantId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ campaigns: result.data });
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  try {
    const body = await req.json();
    const result = await createCampaign(auth.tenantId, body);

    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ campaign: result.data });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
