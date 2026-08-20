import { NextResponse } from 'next/server';
import { fetchLeadsAndStages, createLead } from '@/services/leads.service';

export async function GET(request: Request) {
  try {
    const userId = request.headers.get('x-user-id') || undefined;
    const role = request.headers.get('x-user-role') || undefined;

    const data = await fetchLeadsAndStages({ userId, role });
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
