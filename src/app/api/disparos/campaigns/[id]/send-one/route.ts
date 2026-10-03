import { NextRequest, NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { sendCampaignContact } from '@/services/disparos.service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) return NextResponse.json({ success: false, error: auth.error.message }, { status: auth.error.status });

  const { id: campaignId } = await params;

  try {
    const { contactId } = await req.json();
    // Envia pelo WhatsApp da própria empresa.
    const result = await sendCampaignContact(auth.tenantId, campaignId, contactId);

    if (!result.success) return NextResponse.json({ success: false, error: result.error });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 });
  }
}
