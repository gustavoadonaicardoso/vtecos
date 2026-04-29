/**
 * POST /api/fiscal/csv
 *
 * Recebe dados do emitente + conteúdo de um arquivo CSV e usa
 * o Gemini para gerar uma NF-e por linha de dados do arquivo.
 *
 * Limita a 200 linhas de dados por requisição para não exceder
 * o limite de tokens do modelo.
 */

import { NextResponse } from 'next/server';
import { callGemini, parseGeminiJsonArray } from '@/lib/gemini';
import { sanitizarNota } from '@/lib/fiscal';
import type { GerarNotasViaCsvPayload } from '@/types/fiscal';
import { buildNfeFromCsvPrompt } from '../gerar/prompt';

const MAX_CSV_ROWS = 200;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GerarNotasViaCsvPayload;
    const { emitente, csvContent, contexto } = body;

    if (!emitente?.razaoSocial || !emitente?.cnpj) {
      return NextResponse.json({ error: 'Dados do emitente incompletos.' }, { status: 400 });
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json({ error: 'Conteúdo do CSV está vazio.' }, { status: 400 });
    }

    // Truncar CSV para não exceder o limite de tokens
    const csvLines = csvContent.split('\n').filter((l) => l.trim().length > 0);
    const [header, ...dataLines] = csvLines;
    const truncatedCsv = [header, ...dataLines.slice(0, MAX_CSV_ROWS)].join('\n');

    if (dataLines.length === 0) {
      return NextResponse.json({ error: 'O CSV não contém linhas de dados (apenas cabeçalho).' }, { status: 400 });
    }

    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString('pt-BR');
    const anoAtual = hoje.getFullYear();

    const prompt = buildNfeFromCsvPrompt({
      emitente,
      csvContent: truncatedCsv,
      contexto,
      dataHoje,
      anoAtual,
    });

    const geminiResult = await callGemini(prompt, { temperature: 0.4 });

    if (!geminiResult.success) {
      return NextResponse.json({ error: geminiResult.error }, { status: 502 });
    }

    let notas: any[];
    try {
      notas = parseGeminiJsonArray(geminiResult.text);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    const sanitized = notas.map((nota, i) => sanitizarNota(nota, i, anoAtual, dataHoje));

    return NextResponse.json({ notas: sanitized });
  } catch (err: any) {
    console.error('[/api/fiscal/csv]', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
