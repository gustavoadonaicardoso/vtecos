import { NextResponse } from 'next/server';
import { requireActiveProfile } from '@/lib/session';
import { parseStagesInput, savePipelineStages } from '@/services/pipeline.service';

/**
 * Salva a estrutura do funil (etapas, nomes, cores e ordem).
 * Só admin e gerente: as etapas são compartilhadas por toda a equipe.
 */
export async function PUT(request: Request) {
  const auth = await requireActiveProfile({ module: 'crm' });
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  }
  if (auth.profile.role !== 'ADMIN' && auth.profile.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Só administradores e gerentes alteram as etapas do funil.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseStagesInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await savePipelineStages(auth.tenantId, parsed.stages);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, data: result.data });
}
