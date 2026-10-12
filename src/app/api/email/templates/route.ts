import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { listTemplates, saveTemplate } from '@/services/email.service';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await listTemplates(auth) });
}

// POST { id?, name, subject, body } -- cria ou edita um modelo.
export async function POST(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await saveTemplate(auth, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}
