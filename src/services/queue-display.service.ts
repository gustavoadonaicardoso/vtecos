/**
 * ============================================================
 * VÓRTICE CRM — Mídia do Painel de Senhas (server-only)
 * ============================================================
 * Playlist de imagens/vídeos do /display e a rotina de exibição.
 * Os arquivos ficam no bucket público "queue-media" (a TV carrega pela
 * URL); o upload vai direto do navegador para o Storage por uma URL
 * assinada, sem passar o vídeo inteiro pelo servidor do app.
 * ============================================================
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_TYPES,
  normalizeDisplayConfig,
  type DisplayConfig,
  type DisplayMediaItem,
} from '@/lib/queue-display';
import type { ServiceResult } from '@/types';

const BUCKET = 'queue-media';
const MEDIA_COLUMNS = 'id, type, url, title, duration_seconds, position, active';

// ── Rotina ─────────────────────────────────────────────────────

export async function getDisplayConfig(): Promise<DisplayConfig> {
  const { data } = await supabaseAdmin.from('queue_settings').select('display_config').eq('id', 'default').maybeSingle();
  return normalizeDisplayConfig(data?.display_config);
}

export async function saveDisplayConfig(raw: unknown): Promise<ServiceResult<DisplayConfig>> {
  const config = normalizeDisplayConfig(raw);
  const { error } = await supabaseAdmin
    .from('queue_settings')
    .upsert({ id: 'default', display_config: config, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return { success: false, error: error.message };
  return { success: true, data: config };
}

// ── Playlist ───────────────────────────────────────────────────

export async function listDisplayMedia(activeOnly: boolean): Promise<ServiceResult<DisplayMediaItem[]>> {
  let query = supabaseAdmin.from('queue_display_media').select(MEDIA_COLUMNS).order('position').order('created_at');
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data || []) as DisplayMediaItem[] };
}

export async function createUploadUrl(fileName: string, contentType: string, size: number) {
  const isImage = IMAGE_TYPES.includes(contentType);
  const isVideo = VIDEO_TYPES.includes(contentType);
  if (!isImage && !isVideo) {
    return { error: 'Formato não suportado. Use imagens JPG, PNG, WEBP ou GIF, ou vídeos MP4 ou WEBM.' } as const;
  }
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isFinite(size) || size <= 0 || size > limit) {
    return { error: `Arquivo grande demais. Limite: ${Math.round(limit / 1024 / 1024)} MB para ${isImage ? 'imagens' : 'vídeos'}.` } as const;
  }

  const extension = (fileName.split('.').pop() || (isImage ? 'jpg' : 'mp4')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const path = `display/${Date.now()}-${randomUUID()}.${extension}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message || 'Não foi possível preparar o envio.' } as const;
  return { path: data.path, token: data.token, type: isImage ? ('image' as const) : ('video' as const) };
}

export async function createDisplayMedia(input: {
  path: string;
  type: 'image' | 'video';
  title: string;
  durationSeconds: number;
}): Promise<ServiceResult<DisplayMediaItem>> {
  // Só aceita arquivos que o próprio servidor autorizou (pasta display/ do bucket).
  if (!/^display\/[\w.-]+$/.test(input.path)) return { success: false, error: 'Arquivo inválido.' };

  const { data: listed } = await supabaseAdmin.storage.from(BUCKET).list('display', { search: input.path.slice('display/'.length) });
  if (!listed || listed.length === 0) return { success: false, error: 'O arquivo não terminou de enviar. Tente de novo.' };

  const { data: last } = await supabaseAdmin
    .from('queue_display_media')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(input.path).data.publicUrl;
  const { data, error } = await supabaseAdmin
    .from('queue_display_media')
    .insert([{
      type: input.type,
      url,
      storage_path: input.path,
      title: input.title.slice(0, 120),
      duration_seconds: Math.min(600, Math.max(3, Math.round(input.durationSeconds) || 10)),
      position: (last?.position ?? 0) + 1,
      active: true,
    }])
    .select(MEDIA_COLUMNS)
    .single();
  if (error || !data) return { success: false, error: error?.message || 'Falha ao salvar a mídia.' };
  return { success: true, data: data as DisplayMediaItem };
}

export async function updateDisplayMedia(
  id: string,
  updates: { title?: string; durationSeconds?: number; active?: boolean }
): Promise<ServiceResult> {
  const patch: Record<string, unknown> = {};
  if (typeof updates.title === 'string') patch.title = updates.title.slice(0, 120);
  if (updates.durationSeconds !== undefined) patch.duration_seconds = Math.min(600, Math.max(3, Math.round(updates.durationSeconds) || 10));
  if (typeof updates.active === 'boolean') patch.active = updates.active;
  if (Object.keys(patch).length === 0) return { success: true };

  const { error } = await supabaseAdmin.from('queue_display_media').update(patch).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteDisplayMedia(id: string): Promise<ServiceResult> {
  const { data } = await supabaseAdmin.from('queue_display_media').select('storage_path').eq('id', id).maybeSingle();
  const { error } = await supabaseAdmin.from('queue_display_media').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  if (data?.storage_path) await supabaseAdmin.storage.from(BUCKET).remove([data.storage_path]);
  return { success: true };
}

export async function reorderDisplayMedia(ids: string[]): Promise<ServiceResult> {
  const results = await Promise.all(
    ids.map((id, index) => supabaseAdmin.from('queue_display_media').update({ position: index + 1 }).eq('id', id))
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { success: false, error: failed.error.message };
  return { success: true };
}
