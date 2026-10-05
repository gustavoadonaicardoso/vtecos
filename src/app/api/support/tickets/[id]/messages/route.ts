import { NextResponse } from 'next/server';
import { readBody, supportViewer } from '@/lib/support-server/request';
import { replyTicket } from '@/services/support.service';

export const runtime = 'nodejs';

/** Nova mensagem no chamado (Vórtice também pode mandar nota interna e mudar a situação junto). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await supportViewer();
  if ('error' in viewer) return NextResponse.json({ error: viewer.error.message }, { status: viewer.error.status });

  const { body, files } = await readBody(request);
  const result = await replyTicket(viewer, (await params).id, body, files);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true }, { status: 201 });
}
