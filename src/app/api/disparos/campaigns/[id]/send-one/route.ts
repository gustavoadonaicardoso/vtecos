import { NextRequest, NextResponse } from 'next/server';
import { sendCampaignContact } from '@/services/disparos.service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;

  try {
    const { contactId } = await req.json();
    const result = await sendCampaignContact(campaignId, contactId);

    if (!result.success) return NextResponse.json({ success: false, error: result.error });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
