import { NextResponse } from 'next/server';
import { fetchProfileById } from '@/services/auth.service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'User ID missing' }, { status: 400 });
  }

  try {
    const profile = await fetchProfileById(id);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    return NextResponse.json({ data: profile }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to refresh user' }, { status: 500 });
  }
}
