import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { createItem, listItems } from '@/services/scheduling.service';

/** Agenda (?from=&to=, datas AAAA-MM-DD), quadro de tarefas (?tasks=1) ou um item (?id=). */
export async function GET(request: Request) {
  const auth = await requireActiveProfile({ module: 'agendamento', permission: 'integrations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const params = new URL(request.url).searchParams;
  try {
    const data = await listItems(auth.tenantId, auth.profile, {
      from: params.get('from') || undefined,
      to: params.get('to') || undefined,
      tasks: params.get('tasks') === '1',
      id: params.get('id') || undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao carregar a agenda.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'agendamento', permission: 'integrations.view' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const result = await createItem(auth.tenantId, auth.profile, await request.json().catch(() => ({})));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: result }, { status: 201 });
}
