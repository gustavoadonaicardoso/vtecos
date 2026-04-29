/**
 * POST /api/fiscal/gerar
 *
 * Recebe dados do emitente + quantidade + contexto opcional e usa
 * o Gemini para gerar N notas fiscais eletrônicas realistas.
 */

import { NextResponse } from 'next/server';
import { callGemini, parseGeminiJsonArray } from '@/lib/gemini';
import { sanitizarNota } from '@/lib/fiscal';
import type { GerarNotasPayload } from '@/types/fiscal';
import { buildNfePrompt } from './prompt';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GerarNotasPayload;
    const { emitente, quantidade, contexto } = body;

    if (!emitente?.razaoSocial || !emitente?.cnpj) {
      return NextResponse.json({ error: 'Dados do emitente incompletos.' }, { status: 400 });
    }

    if (!quantidade || quantidade < 1 || quantidade > 400) {
      return NextResponse.json({ error: 'Quantidade inválida (1-400).' }, { status: 400 });
    }

    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString('pt-BR');
    const anoAtual = hoje.getFullYear();

    const prompt = buildNfePrompt({ emitente, quantidade, contexto, dataHoje, anoAtual });

    const geminiResult = await callGemini(prompt, { temperature: 0.8 });

    if (!geminiResult.success) {
      return NextResponse.json({ error: geminiResult.error }, { status: 502 });
    }

    let notas: any[];
    try {
      notas = parseGeminiJsonArray(geminiResult.text);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    const sanitized = notas
      .slice(0, quantidade)
      .map((nota, i) => sanitizarNota(nota, i, anoAtual, dataHoje));

    return NextResponse.json({ notas: sanitized });
  } catch (err: any) {
    console.error('[/api/fiscal/gerar]', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
