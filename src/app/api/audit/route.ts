import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, action, details, entityType, entityId } = body;

    await logAudit(user, action, details, entityType, entityId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
