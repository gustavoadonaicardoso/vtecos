import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { createAccount, listAccounts } from '@/services/email.service';

export const runtime = 'nodejs';

// GET -- caixas que a pessoa vê (da empresa + a pessoal), com não lidos.
export async function GET() {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  return NextResponse.json({ data: await listAccounts(auth) });
}

// POST -- conecta uma caixa (testa entrada e saída antes de salvar).
export async function POST(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await createAccount(auth, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
