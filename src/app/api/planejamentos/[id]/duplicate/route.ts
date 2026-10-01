import { NextResponse } from 'next/server';
import { duplicateBoard } from '@/services/planning.service';
import { requireActiveProfile } from '@/lib/session';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const { id } = await params;
  const result = await duplicateBoard(id, auth.profile.id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
}
