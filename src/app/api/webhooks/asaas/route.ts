import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { platformSettings } from '@/lib/platform-settings';
import { handleAsaasEvent } from '@/services/billing.service';

/**
 * Avisos do Asaas (pagamento recebido, vencido, estornado...). Público,
 * mas só aceita quem manda o token configurado no Painel Master >
 * Plataforma (o Asaas envia no cabeçalho asaas-access-token).
 * Responde 200 sempre que o aviso é dele: o Asaas para a fila depois de
 * 15 respostas de erro, e a rotina do servidor confere de novo depois.
 */
function sameToken(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const { asaasWebhookToken } = await platformSettings();
  if (!asaasWebhookToken) return NextResponse.json({ error: 'Webhook do Asaas não configurado.' }, { status: 503 });
  const received = request.headers.get('asaas-access-token') || '';
  if (!received || !sameToken(received, asaasWebhookToken)) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ received: false }, { status: 400 });
  const result = await handleAsaasEvent(body as Record<string, unknown>);
  return NextResponse.json({ received: true, status: result.status });
}
