import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { getThread } from '@/services/email.service';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// GET -- a conversa inteira do e-mail (marca como lido).
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const result = await getThread(auth, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}
