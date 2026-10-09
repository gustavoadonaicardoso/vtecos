import { NextResponse } from 'next/server';
import { createProject, fetchProjects } from '@/services/projects.service';
import { requireActiveProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Usuário e empresa vêm da sessão (antes: cabeçalho x-user-id, forjável).

export async function GET() {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: ['admin.projects', 'planejamentos.view', 'social.view'] });
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

  return NextResponse.json({ data: result.data, canEdit: ['ADMIN', 'MANAGER'].includes(auth.profile.role) }, { status: 200 });
}

/** Novo projeto (administrador ou gerente). */
export async function POST(request: Request) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'admin.projects' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (!['ADMIN', 'MANAGER'].includes(auth.profile.role)) {
    return NextResponse.json({ error: 'Só administradores e gerentes criam projetos.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await createProject(auth.tenantId, body && typeof body === 'object' ? body : {});
  if (!result.success || !result.data) return NextResponse.json({ error: result.error || 'Não foi possível criar o projeto.' }, { status: 400 });

  logAudit({ id: auth.profile.id, name: auth.profile.name }, 'PROJECT', `Projeto "${result.data.project_name}" criado.`, 'project', String(result.data.id), supabaseAdmin, auth.tenantId).catch(() => {});
  return NextResponse.json({ data: result.data }, { status: 201 });
}
