import { NextRequest, NextResponse } from 'next/server';
import { fetchCampaigns, createCampaign } from '@/services/disparos.service';

export async function GET() {
  const result = await fetchCampaigns();
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ campaigns: result.data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await createCampaign(body);

    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ campaign: result.data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
