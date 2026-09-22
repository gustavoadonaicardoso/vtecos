import { NextResponse } from 'next/server';
import {
  normalizeBrazilPhone,
  parseBrazilDocumentInput,
  validateBrazilDocument,
  validateBrazilPhone,
} from '@/lib/brazilian-fields';
import { createQueueTicket } from '@/services/queue.service';

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
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

    const ticket = await createQueueTicket({ name, whatsapp, document });

    return NextResponse.json({ number: ticket.number }, { status: 201 });
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
