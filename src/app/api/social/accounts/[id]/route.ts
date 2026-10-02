import { NextResponse } from 'next/server';
import { requireAdminProfile } from '@/lib/session';
import { disconnectAccount } from '@/services/social.service';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { id } = await params;
  const result = await disconnectAccount(id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true });
}
