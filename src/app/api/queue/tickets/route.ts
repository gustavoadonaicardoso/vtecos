import { NextResponse } from 'next/server';
import {
  normalizeBrazilPhone,
  parseBrazilDocumentInput,
  validateBrazilDocument,
  validateBrazilPhone,
} from '@/lib/brazilian-fields';
import { createQueueTicket, getQueueSettings } from '@/services/queue.service';
import { requireActiveProfile } from '@/lib/session';
import { resolveTenantByDisplayKey } from '@/services/tenant-public.service';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;

    // Totem (público) identifica a empresa pela chave da URL; a recepção,
    // pela sessão de quem está logado.
    let tenant: { id: string; name: string } | null = null;
    if (payload.key !== undefined) {
      tenant = await resolveTenantByDisplayKey(payload.key);
      if (!tenant) return NextResponse.json({ error: 'Totem não configurado. Peça o link correto à recepção.' }, { status: 404 });
    } else {
      const auth = await requireActiveProfile({ module: 'senhas', permission: 'integrations.view' });
      if ('error' in auth) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
      tenant = { id: auth.tenantId, name: auth.tenantName };
    }
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const rawWhatsapp = typeof payload.whatsapp === 'string' ? payload.whatsapp : '';
    const rawDocument = typeof payload.document === 'string' ? payload.document : '';
    const whatsapp = normalizeBrazilPhone(rawWhatsapp);
    const document = parseBrazilDocumentInput(rawDocument);

    if (!name) {
      return NextResponse.json({ error: 'Informe o nome completo.' }, { status: 400 });
    }

    const validationError = validateBrazilPhone(rawWhatsapp) || validateBrazilDocument(rawDocument);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const origin = payload.origin === 'recepcao' ? 'recepcao' : 'totem';
    // Preferencial só quando a empresa usa (a recepção sempre pode marcar).
    const settings = await getQueueSettings(tenant);
    const priority = payload.priority === true && (origin === 'recepcao' || settings.priorityEnabled);
    const ticket = await createQueueTicket(tenant, { name, whatsapp: whatsapp || null, document: document || null, origin, priority });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error: unknown) {
    const details = error && typeof error === 'object' ? error as Record<string, unknown> : null;
    const message =
      (typeof details?.message === 'string' && details.message) ||
      (typeof error === 'string' && error) ||
      'Não foi possível gerar a senha.';

    console.error('Queue ticket creation failed:', {
      message,
      code: details?.code,
      details: details?.details,
      hint: details?.hint,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
