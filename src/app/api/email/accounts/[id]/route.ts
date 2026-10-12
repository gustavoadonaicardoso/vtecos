import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { deleteAccount, updateAccount } from '@/services/email.service';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// PATCH -- edita (nome, assinatura, servidores, senha) ou { action: pause|resume }.
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const result = await updateAccount(auth, id, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}

// DELETE -- desconecta a caixa (apaga os e-mails guardados no sistema, não no servidor).
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const result = await deleteAccount(auth, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: true });
}
