import { NextResponse } from 'next/server';
import { fetchProjects, replaceProjects } from '@/services/projects.service';
import { requireActiveProfile } from '@/lib/session';

// Usuário e empresa vêm da sessão (antes: cabeçalho x-user-id, forjável).

export async function GET() {
  const auth = await requireActiveProfile({ module: 'planejamentos' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  const permissions = auth.profile.permissions as { admin?: { projects?: boolean } } | undefined;
  const hasProjectPermission = ['ADMIN', 'MANAGER'].includes(auth.profile.role) || permissions?.admin?.projects === true;
  if (!hasProjectPermission) {
    return NextResponse.json({ error: 'Usuário sem permissão para visualizar projetos.' }, { status: 403 });
  }

  const result = await fetchProjects(auth.tenantId);
  if (!result.success) {
    console.error('List projects error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}

export async function PUT(request: Request) {
  const auth = await requireActiveProfile({ module: 'planejamentos' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });

  if (auth.profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas administradores podem alterar projetos.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (!Array.isArray(body.projects)) {
      return NextResponse.json({ error: 'Lista de projetos inválida.' }, { status: 400 });
    }

    const result = await replaceProjects(auth.tenantId, body.projects);
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
