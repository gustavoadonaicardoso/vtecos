/**
 * IA do sistema: local (Ollama, na própria VPS) ou Google Gemini.
 *
 * Todas as partes que usam IA (blocos de IA das Automações, legendas das
 * Redes Sociais, notas fiscais) chamam callAI(), que escolhe o provedor
 * pelas variáveis do .env.local:
 *
 *   AI_PROVIDER=ollama            usa a IA local (padrão: gemini)
 *   OLLAMA_URL=http://127.0.0.1:11434
 *   OLLAMA_MODEL=gemma3:4b
 *   OLLAMA_TIMEOUT_SECONDS=180
 *
 * Com AI_PROVIDER=ollama e GEMINI_API_KEY preenchida, o Gemini vira
 * reserva: se a IA local falhar ou demorar demais, a resposta vem dele.
 * Tarefas pesadas (preferCloud, ex.: notas fiscais) vão direto para o
 * Gemini quando ele existe -- no processador da VPS levariam minutos.
 *
 * Só para o servidor.
 */

import { callGemini, type GeminiResult, type GeminiError } from '@/lib/gemini';

export interface AiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  /** Texto longo/estruturado: usa o Gemini se houver chave. */
  preferCloud?: boolean;
}

export type AiResult = GeminiResult | GeminiError;

export type AiProvider = 'ollama' | 'gemini';

export function aiProvider(): AiProvider {
  return (process.env.AI_PROVIDER || '').trim().toLowerCase() === 'ollama' ? 'ollama' : 'gemini';
}

const ollamaUrl = () => (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
export const ollamaModel = () => (process.env.OLLAMA_MODEL || 'gemma3:4b').trim();
const hasGemini = () => Boolean(process.env.GEMINI_API_KEY);

/** Há alguma IA configurada no servidor? */
export function aiConfigured() {
  return aiProvider() === 'ollama' || hasGemini();
}

/** Nome para mostrar nas telas (Integrações, avisos). */
export function aiLabel() {
  if (aiProvider() === 'ollama') return `IA local (${ollamaModel()})${hasGemini() ? ' + Gemini de reserva' : ''}`;
  return hasGemini() ? 'Google Gemini' : 'Nenhuma';
}

async function callOllama(prompt: string, options: AiCallOptions): Promise<AiResult> {
  const timeoutSeconds = Math.max(10, Number(process.env.OLLAMA_TIMEOUT_SECONDS) || 180);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  const started = Date.now();
  try {
    const res = await fetch(`${ollamaUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: ollamaModel(),
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        // Todas as chamadas do sistema esperam um JSON de volta.
        format: 'json',
        // Mantém o modelo na memória: carregar de novo leva ~30s.
        keep_alive: '24h',
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: Math.min(options.maxOutputTokens ?? 1024, 4096),
          num_ctx: 4096,
        },
      }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      console.error('[IA] Ollama HTTP', res.status, text);
      const hint = res.status === 404 ? ` O modelo ${ollamaModel()} foi baixado? Rode: ollama pull ${ollamaModel()}` : '';
      return { success: false, error: `A IA local respondeu com erro ${res.status}.${hint}`, status: 502 };
    }
    const data = await res.json();
    const text = String(data?.message?.content ?? '');
    console.info(`[IA] ${ollamaModel()} respondeu em ${((Date.now() - started) / 1000).toFixed(1)}s (${data?.eval_count ?? '?'} tokens)`);
    if (!text.trim()) return { success: false, error: 'A IA local não devolveu resposta.', status: 502 };
    return { success: true, text };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    console.error('[IA] Ollama falhou:', aborted ? `passou de ${timeoutSeconds}s` : error);
    return {
      success: false,
      error: aborted
        ? `A IA local demorou mais de ${timeoutSeconds}s para responder.`
        : 'Não foi possível falar com a IA local. Confira se o Ollama está ligado (systemctl status ollama).',
      status: 503,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Chama a IA configurada e devolve o texto (JSON) da resposta. */
export async function callAI(prompt: string, options: AiCallOptions = {}): Promise<AiResult> {
  if (aiProvider() !== 'ollama') return callGemini(prompt, options);
  if (options.preferCloud && hasGemini()) return callGemini(prompt, options);

  const local = await callOllama(prompt, options);
  if (local.success || !hasGemini()) return local;
  console.warn('[IA] Usando o Gemini de reserva:', local.error);
  return callGemini(prompt, options);
}
