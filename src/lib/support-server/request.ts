import { requireActiveProfile } from '@/lib/session';
import type { UploadFile, Viewer } from '@/services/support.service';

/** Quem está pedindo (qualquer usuário ativo; a Vórtice vira "atendimento"). */
export async function supportViewer(): Promise<Viewer | { error: { message: string; status: number } }> {
  const auth = await requireActiveProfile();
  if ('error' in auth) return auth;
  return {
    profile: { id: auth.profile.id, name: auth.profile.name, email: auth.profile.email, role: auth.profile.role, phone: auth.profile.phone ?? null },
    tenantId: auth.tenantId,
    tenantName: auth.tenantName,
    isPlatform: auth.isPlatform,
  };
}

/** Aceita JSON ou formulário com arquivos (campo "files"). */
export async function readBody(request: Request): Promise<{ body: Record<string, unknown>; files: UploadFile[] }> {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('multipart/form-data')) {
    return { body: ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>, files: [] };
  }
  const form = await request.formData();
  const body: Record<string, unknown> = {};
  const files: UploadFile[] = [];
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      if (value.size > 0) files.push({ name: value.name, type: value.type || 'application/octet-stream', size: value.size, buffer: Buffer.from(await value.arrayBuffer()) });
    } else {
      body[key] = value;
    }
  }
  return { body, files };
}
