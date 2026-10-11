/**
 * ============================================================
 * VÓRTICE CRM — Gemini AI Helper (Server-side only)
 * ============================================================
 * Chamada à API do Gemini. Use pelo callAI() (src/lib/ai.ts), que
 * escolhe a chave (da empresa ou da Vórtice) e conta a franquia.
 *
 * ⚠️  Este módulo só deve ser importado por Route Handlers
 *     (Server Components / API routes). Nunca pelo lado do cliente.
 * ============================================================
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiCallOptions {
  /** Chave da API. Sem ela, usa a IA padrão da Vórtice (Painel Master > Plataforma). */
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
  // Sem chave informada: a IA padrão da Vórtice (Painel Master > Plataforma, ou .env).
  const apiKey = options.apiKey || (await import('@/lib/platform-settings').then((m) => m.platformSettings())).geminiKey || undefined;

  if (!apiKey) {
    return {
      success: false,
      error: 'Nenhuma chave do Gemini configurada. A Vórtice cadastra em Painel Master > Plataforma; a empresa pode usar a própria em Integrações.',
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
      error: `Erro na API Gemini: ${res.status}. Confira a chave do Gemini.`,
      status: res.status,
    };
  }

  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return { success: true, text };
}
