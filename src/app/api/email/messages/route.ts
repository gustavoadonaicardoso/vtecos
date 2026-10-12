import { NextResponse } from 'next/server';
import { requireEmailUser } from '@/lib/email/auth';
import { listMessages, updateMessages } from '@/services/email.service';

export const runtime = 'nodejs';

// GET ?account=all|id&folder=inbox|sent|trash|starred&q=&page=
export async function GET(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const search = new URL(request.url).searchParams;
  const result = await listMessages(auth, { account: search.get('account') || 'all', folder: search.get('folder') || 'inbox', q: search.get('q') || '', page: Number(search.get('page')) || 0 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}

// PATCH { ids, action: read|unread|star|unstar|trash|restore|delete }
export async function PATCH(request: Request) {
  const auth = await requireEmailUser();
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const result = await updateMessages(auth, await request.json().catch(() => ({})));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result.data });
}
