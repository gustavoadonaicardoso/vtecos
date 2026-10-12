import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { createLimiter } from '@/lib/rate-limit';
import { MAX_SEND_BYTES, sendEmail, type SendFile } from '@/services/email.service';

export const runtime = 'nodejs';

const limiter = createLimiter({ windowMs: 60 * 60_000, max: 120 });

// POST (multipart) -- accountId, to, cc, bcc, subject, body, mode (reply|forward), parentId, keepAttachments, files[]
export async function POST(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const limit = limiter.blocked(auth.profile.id);
  if (limit.blocked) return NextResponse.json({ error: 'Muitos e-mails em pouco tempo. Para mandar para muita gente, use os Disparos.' }, { status: 429 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Envio inválido.' }, { status: 400 });
  const body: Record<string, string> = {};
  const files: SendFile[] = [];
  let total = 0;
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      body[key] = value;
      continue;
    }
    total += value.size;
    if (total > MAX_SEND_BYTES) return NextResponse.json({ error: 'Os anexos passam de 20 MB.' }, { status: 413 });
    files.push({ name: value.name || 'anexo', type: value.type || 'application/octet-stream', content: Buffer.from(await value.arrayBuffer()) });
  }
  limiter.hit(auth.profile.id);
  const result = await sendEmail(auth, body, files);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
