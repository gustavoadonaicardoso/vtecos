import { NextResponse } from 'next/server';
import { fetchLeadsAndStages, createLead } from '@/services/leads.service';

export async function GET() {
  try {
    const data = await fetchLeadsAndStages();
    if (!data) return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const leadData = await request.json();
    const result = await createLead(leadData);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
