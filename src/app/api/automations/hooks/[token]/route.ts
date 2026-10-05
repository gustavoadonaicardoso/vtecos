import { NextResponse } from 'next/server';
import { handleAutomationWebhook } from '@/lib/automations/engine';

/**
 * Gatilho "Chamada de outro sistema": Make, Zapier, n8n, site, ERP...
 * O token no endereço identifica o fluxo (e a empresa). Aceita JSON ou
 * formulário; o telefone do contato é obrigatório.
 */

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contentType = request.headers.get('content-type') || '';
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 64 * 1024) return NextResponse.json({ error: 'Corpo acima de 64 KB.' }, { status: 413, headers: CORS });

  let payload: Record<string, unknown> = {};
  try {
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      payload = Object.fromEntries([...(await request.formData()).entries()].filter(([, value]) => typeof value === 'string'));
    } else {
      const text = await request.text();
      if (text.length > 64 * 1024) return NextResponse.json({ error: 'Corpo acima de 64 KB.' }, { status: 413, headers: CORS });
      const parsed = text ? JSON.parse(text) : {};
      payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
  } catch {
    return NextResponse.json({ error: 'Corpo inválido: envie JSON ou um formulário.' }, { status: 400, headers: CORS });
  }

  const result = await handleAutomationWebhook(token, payload);
  return NextResponse.json(result.body, { status: result.status, headers: CORS });
}
