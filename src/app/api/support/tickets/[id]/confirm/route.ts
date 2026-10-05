import { NextResponse } from 'next/server';
import { supportViewer } from '@/lib/support-server/request';
import { confirmResolved } from '@/services/support.service';

/** Cliente confirma que o problema foi resolvido e avalia o atendimento. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await supportViewer();
  if ('error' in viewer) return NextResponse.json({ error: viewer.error.message }, { status: viewer.error.status });

  const result = await confirmResolved(viewer, (await params).id, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}
