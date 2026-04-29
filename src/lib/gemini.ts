/**
 * ============================================================
 * VÓRTICE CRM — Gemini AI Helper (Server-side only)
 * ============================================================
 * Centraliza a lógica de chamada à API Gemini para evitar
 * duplicação entre as rotas /api/fiscal/gerar e /api/fiscal/csv.
 *
 * ⚠️  Este módulo só deve ser importado por Route Handlers
 *     (Server Components / API routes). Nunca pelo lado do cliente.
 * ============================================================
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiCallOptions {
  /** API key. Defaults to process.env.GEMINI_API_KEY */
  apiKey?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiResult {
  success: true;
  text: string;
}

export interface GeminiError {
  success: false;
  error: string;
  status?: number;
}

/**
 * Chama a API Gemini com o prompt fornecido e retorna o texto bruto.
 * Solicita saída em JSON puro (responseMimeType: application/json).
 */
export async function callGemini(
  prompt: string,
  options: GeminiCallOptions = {}
): Promise<GeminiResult | GeminiError> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Chave GEMINI_API_KEY não configurada no servidor. Adicione-a ao .env.local.',
    };
  }

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens ?? 32768,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[GeminiHelper] HTTP error:', errText);
    return {
      success: false,
      error: `Erro na API Gemini: ${res.status} — Verifique sua GEMINI_API_KEY.`,
      status: res.status,
    };
  }

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return { success: true, text };
}

/**
 * Faz parse do JSON retornado pelo Gemini e garante que é um array.
 * Lança Error descritivo se o formato for inválido.
 */
export function parseGeminiJsonArray(rawText: string): any[] {
  try {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) {
      throw new Error('A resposta da IA não é um array JSON.');
    }
    return parsed;
  } catch (err) {
    console.error('[GeminiHelper] Parse error. Raw (500 chars):', rawText.slice(0, 500));
    throw new Error('A IA retornou um formato inválido. Tente novamente.');
  }
}
