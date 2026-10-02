import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { parsePostInput } from '@/lib/social/input';
import { createPost, listPosts } from '@/services/social.service';

export async function GET(request: Request) {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const params = new URL(request.url).searchParams;
  const result = await listPosts({
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    status: params.get('status') || undefined,
    accountId: params.get('accountId') || undefined,
    projectId: params.get('projectId') || undefined,
  });

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data });
}

export async function POST(request: Request) {
  const auth = await requireActiveProfile();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePostInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await createPost(parsed.input, auth.profile.id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data }, { status: 201 });
}
