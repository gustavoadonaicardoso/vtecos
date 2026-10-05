import { NextResponse } from 'next/server';
import { readBody, supportViewer } from '@/lib/support-server/request';
import { createTicket, isStaff, listTickets, supportTeam, ticketCounts } from '@/services/support.service';

export const runtime = 'nodejs';

/** Lista de chamados (cliente: os da empresa dele; Vórtice: de todas). */
export async function GET(request: Request) {
  const viewer = await supportViewer();
  if ('error' in viewer) return NextResponse.json({ error: viewer.error.message }, { status: viewer.error.status });

  const params = new URL(request.url).searchParams;
  const view = params.get('view');
  try {
    const staff = isStaff(viewer);
    const [data, counts, team] = await Promise.all([
      listTickets(viewer, {
        view: view === 'open' || view === 'active' || view === 'waiting' || view === 'done' ? view : 'all',
        mine: params.get('mine') === '1',
        unassigned: params.get('unassigned') === '1',
        tenantId: params.get('tenant') || undefined,
        q: params.get('q') || undefined,
      }),
      ticketCounts(viewer),
      staff ? supportTeam() : Promise.resolve([]),
    ]);
    return NextResponse.json({ data, counts, staff, team, me: viewer.profile.id, myPhone: viewer.profile.phone || '' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar os chamados.' }, { status: 500 });
  }
}

/** Cliente abre um chamado (com anexos opcionais). */
export async function POST(request: Request) {
  const viewer = await supportViewer();
  if ('error' in viewer) return NextResponse.json({ error: viewer.error.message }, { status: viewer.error.status });

  const { body, files } = await readBody(request);
  const result = await createTicket(viewer, body, files);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result }, { status: 201 });
}
