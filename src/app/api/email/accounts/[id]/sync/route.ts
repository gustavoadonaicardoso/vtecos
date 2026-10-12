import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { createLimiter } from '@/lib/rate-limit';
import { syncAccountNow } from '@/services/email.service';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };
const limiter = createLimiter({ windowMs: 60_000, max: 6 });

// POST -- botão "Atualizar": busca os e-mails novos agora.
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const { id } = await params;
  const key = `${auth.profile.id}:${id}`;
  if (limiter.blocked(key).blocked) return NextResponse.json({ error: 'Espere um pouco para atualizar de novo.' }, { status: 429 });
  limiter.hit(key);
  const result = await syncAccountNow(auth, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}
