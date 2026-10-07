/**
 * IA do sistema: local (Ollama, na própria VPS) ou Google Gemini.
 *
 * Todas as partes que usam IA (blocos de IA das Automações, legendas das
 * Redes Sociais, notas fiscais) chamam callAI(). A IA da Vórtice é
 * escolhida no Painel Master > Plataforma (campo vazio cai para o .env):
 *
 *   AI_PROVIDER=ollama            usa a IA local (padrão: gemini)
 *   OLLAMA_URL=http://127.0.0.1:11434
 *   OLLAMA_MODEL=gemma3:4b
 *   OLLAMA_TIMEOUT_SECONDS=180
 *
 * Cada empresa pode cadastrar a PRÓPRIA chave do Gemini em Integrações
 * (integrations_config, provider "ai"): aí as chamadas dela usam (e são
 * cobradas) nessa chave. Sem chave própria, vale a IA da Vórtice abaixo.
 *
 * Com AI_PROVIDER=ollama e GEMINI_API_KEY preenchida, o Gemini vira
 * reserva: se a IA local falhar ou demorar demais, a resposta vem dele.
 * Tarefas pesadas (preferCloud, ex.: notas fiscais) vão direto para o
 * Gemini quando ele existe -- no processador da VPS levariam minutos.
 *
 * Só para o servidor.
 */

import { callGemini, type GeminiResult, type GeminiError } from '@/lib/gemini';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { platformSettings } from '@/lib/platform-settings';

export interface AiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
  /** Texto longo/estruturado: usa o Gemini se houver chave. */
  preferCloud?: boolean;
  /** Empresa que está usando: se ela tem chave própria do Gemini, usa a dela. */
  tenantId?: string;
}

export type AiResult = GeminiResult | GeminiError;

export type AiProvider = 'ollama' | 'gemini';

// IA da Vórtice: Painel Master > Plataforma (ou .env, se o campo estiver vazio).
export async function aiProvider(): Promise<AiProvider> {
  return (await platformSettings()).aiProvider;
}

/** Há alguma IA da Vórtice configurada? */
export async function aiConfigured() {
  const settings = await platformSettings();
  return settings.aiProvider === 'ollama' || Boolean(settings.geminiKey);
}

/** Nome para mostrar nas telas (Integrações, avisos). */
export async function aiLabel() {
  const settings = await platformSettings();
  if (settings.aiProvider === 'ollama') return `IA local (${settings.ollamaModel})${settings.geminiKey ? ' + Gemini de reserva' : ''}`;
  return settings.geminiKey ? 'Google Gemini' : 'Nenhuma';
}

async function callOllama(prompt: string, options: AiCallOptions): Promise<AiResult> {
  const settings = await platformSettings();
  const ollamaUrl = () => settings.ollamaUrl.replace(/\/+$/, '');
  const ollamaModel = () => settings.ollamaModel;
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

// ── Chave própria da empresa ─────────────────────────────────

const keyCache = new Map<string, { key: string | null; at: number }>();
const KEY_TTL = 60_000;

/** Chave do Gemini cadastrada pela empresa (null = usa a IA da Vórtice). */
export async function tenantGeminiKey(tenantId: string): Promise<string | null> {
  const cached = keyCache.get(tenantId);
  if (cached && Date.now() - cached.at < KEY_TTL) return cached.key;
  const { data } = await supabaseAdmin.from('integrations_config').select('config').eq('tenant_id', tenantId).eq('provider', 'ai').maybeSingle();
  const config = (data?.config || {}) as { geminiKey?: string; enabled?: boolean };
  const key = config.enabled !== false && config.geminiKey ? String(config.geminiKey) : null;
  keyCache.set(tenantId, { key, at: Date.now() });
  return key;
}

export const forgetTenantAiKey = (tenantId: string) => keyCache.delete(tenantId);

/** A empresa tem alguma IA para usar (a própria ou a da Vórtice)? */
export async function aiAvailableFor(tenantId: string) {
  return (await aiConfigured()) || Boolean(await tenantGeminiKey(tenantId));
}

/** Confere uma chave do Gemini (lista os modelos, sem gastar). */
export async function checkGeminiKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[\w-]{20,80}$/.test(key)) return { ok: false, error: 'A chave do Gemini começa com AIza e tem cerca de 39 caracteres.' };
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) });
    if (response.ok) return { ok: true };
    return { ok: false, error: response.status === 400 || response.status === 403 ? 'O Google recusou a chave. Confira se copiou inteira e se a API Generative Language está ativa.' : `O Google respondeu ${response.status}.` };
  } catch {
    return { ok: false, error: 'Não foi possível falar com o Google agora. Tente de novo em instantes.' };
  }
}

/** Chama a IA configurada e devolve o texto (JSON) da resposta. */
export async function callAI(prompt: string, options: AiCallOptions = {}): Promise<AiResult> {
  if (options.tenantId) {
    const own = await tenantGeminiKey(options.tenantId).catch(() => null);
    if (own) {
      const result = await callGemini(prompt, { ...options, apiKey: own });
      return result.success ? result : { ...result, error: `Chave do Gemini da empresa: ${result.error.replace(/ ?Confira a chave do Gemini\.?/, '')} Confira a chave em Integrações > Inteligência artificial.` };
    }
  }
  const settings = await platformSettings();
  const platformKey = settings.geminiKey || undefined;
  if (settings.aiProvider !== 'ollama') return callGemini(prompt, { ...options, apiKey: platformKey });
  if (options.preferCloud && platformKey) return callGemini(prompt, { ...options, apiKey: platformKey });

  const local = await callOllama(prompt, options);
  if (local.success || !platformKey) return local;
  console.warn('[IA] Usando o Gemini de reserva:', local.error);
  return callGemini(prompt, { ...options, apiKey: platformKey });
}
