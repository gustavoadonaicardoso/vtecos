import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { linkLeadEmails, listLeadEmails } from '@/services/email.service';

export const runtime = 'nodejs';

// GET ?lead=ID -- últimos e-mails do lead (das caixas que a pessoa vê).
export async function GET(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await listLeadEmails(auth, new URL(request.url).searchParams.get('lead') || '');
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}

// POST { leadId } -- liga ao lead os e-mails já guardados do endereço dele (ex.: lead criado a partir de um e-mail).
export async function POST(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const body = await request.json().catch(() => ({}));
  const result = await linkLeadEmails(auth, String(body.leadId || ''));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}
