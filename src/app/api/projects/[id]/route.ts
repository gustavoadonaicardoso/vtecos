import { NextResponse } from 'next/server';
import { deleteProject, updateProject } from '@/services/projects.service';
import { requireActiveProfile } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { supabaseAdmin } from '@/lib/supabase-admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITORS = ['ADMIN', 'MANAGER'];

/** Edita um projeto (administrador ou gerente). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'admin.projects' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (!EDITORS.includes(auth.profile.role)) return NextResponse.json({ error: 'Só administradores e gerentes editam projetos.' }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const result = await updateProject(auth.tenantId, id, body && typeof body === 'object' ? body : {});
  if (!result.success || !result.data) {
    const status = result.error === 'Projeto não encontrado.' ? 404 : 400;
    return NextResponse.json({ error: result.error || 'Não foi possível salvar.' }, { status });
  }

  logAudit({ id: auth.profile.id, name: auth.profile.name }, 'PROJECT', `Projeto "${result.data.project_name}" alterado.`, 'project', id, supabaseAdmin, auth.tenantId).catch(() => {});
  return NextResponse.json({ data: result.data });
}

/** Exclui um projeto. Planejamentos e contas vinculados ficam, só sem o vínculo. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveProfile({ module: 'planejamentos', permission: 'admin.projects' });
  if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  if (!EDITORS.includes(auth.profile.role)) return NextResponse.json({ error: 'Só administradores e gerentes excluem projetos.' }, { status: 403 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Projeto não encontrado.' }, { status: 404 });
  const result = await deleteProject(auth.tenantId, id);
  if (!result.success || !result.data) return NextResponse.json({ error: result.error || 'Não foi possível excluir.' }, { status: result.error === 'Projeto não encontrado.' ? 404 : 400 });

  logAudit({ id: auth.profile.id, name: auth.profile.name }, 'PROJECT', `Projeto "${result.data.name}" excluído.`, 'project', id, supabaseAdmin, auth.tenantId).catch(() => {});
  return NextResponse.json({ success: true });
}
