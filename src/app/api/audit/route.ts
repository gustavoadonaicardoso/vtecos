import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, action, details, entityType, entityId } = body;

    await logAudit(user, action, details, entityType, entityId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao registrar auditoria.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
