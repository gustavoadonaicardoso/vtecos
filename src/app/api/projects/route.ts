import { NextResponse } from 'next/server';
import { fetchRequesterProfile, fetchProjects, replaceProjects } from '@/services/projects.service';

async function getRequester(request: Request) {
  const requesterId = request.headers.get('x-user-id');
  if (!requesterId) return null;
  return fetchRequesterProfile(requesterId);
}

export async function GET(request: Request) {
  const requester = await getRequester(request);
  const hasProjectPermission = requester && (
    ['ADMIN', 'MANAGER'].includes(requester.role) ||
    requester.permissions?.admin?.projects === true
  );

  if (!hasProjectPermission) {
    return NextResponse.json(
      { error: 'Usuário sem permissão para visualizar projetos.' },
      { status: 403 }
    );
  }

  const result = await fetchProjects();
  if (!result.success) {
    console.error('List projects error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}

export async function PUT(request: Request) {
  const requester = await getRequester(request);

  if (!requester || requester.role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Apenas administradores podem alterar projetos.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    if (!Array.isArray(body.projects)) {
      return NextResponse.json({ error: 'Lista de projetos inválida.' }, { status: 400 });
    }

    const result = await replaceProjects(body.projects);
    if (!result.success) {
      console.error('Save projects error:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro ao salvar projetos.' },
      { status: 500 }
    );
  }
}
