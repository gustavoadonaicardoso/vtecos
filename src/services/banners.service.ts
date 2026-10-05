/**
 * ============================================================
 * VTEC OS — Banners da tela Início (server-only)
 * ============================================================
 * A Vórtice publica banners para as empresas. Quem vê é decidido aqui,
 * no servidor: público (todas, só clientes, só a Vórtice, empresas
 * escolhidas), módulos do plano, cargo e período. O navegador não lê
 * mais a tabela direto.
 * ============================================================
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { sanitizeModules } from '@/lib/plans';
import { normalizeBannerLink, type BannerAudience, type BannerItem, type HomeBanner } from '@/lib/banners';

type Row = Record<string, unknown>;
const AUDIENCES: BannerAudience[] = ['all', 'clients', 'platform', 'tenants'];
const ROLES = ['ADMIN', 'MANAGER', 'SELLER'];
const BUCKET = 'platform-assets';

const toItem = (row: Row): BannerItem => ({
  id: String(row.id),
  title: String(row.title || ''),
  description: String(row.description || ''),
  type: String(row.type || ''),
  date: String(row.date || ''),
  color: String(row.color || ''),
  iconName: (row.icon_name as string) || undefined,
  imageUrl: String(row.image_url || ''),
  linkUrl: String(row.link_url || ''),
  buttonLabel: String(row.button_label || ''),
  startsAt: (row.starts_at as string) || '',
  endsAt: (row.ends_at as string) || '',
  active: row.active !== false,
  position: Number(row.position) || 0,
  audience: (AUDIENCES.includes(row.audience as BannerAudience) ? row.audience : 'all') as BannerAudience,
  targetTenants: Array.isArray(row.target_tenants) ? (row.target_tenants as string[]) : [],
  targetModules: Array.isArray(row.target_modules) ? (row.target_modules as string[]) : [],
  target_roles: Array.isArray(row.target_roles) ? (row.target_roles as string[]) : [],
  dismissible: row.dismissible !== false,
});

/** Banners que esta pessoa vê agora. */
export async function bannersFor(viewer: { tenantId: string; isPlatform: boolean; modules: string[]; role: string }): Promise<HomeBanner[]> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('platform_banners')
    .select('*')
    .eq('active', true)
    .order('position')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return ((data || []) as Row[])
    .map(toItem)
    .filter((banner) => (!banner.startsAt || banner.startsAt <= now) && (!banner.endsAt || banner.endsAt >= now))
    .filter((banner) => {
      if (banner.audience === 'clients' && viewer.isPlatform) return false;
      if (banner.audience === 'platform' && !viewer.isPlatform) return false;
      if (banner.audience === 'tenants' && !banner.targetTenants.includes(viewer.tenantId)) return false;
      if (banner.targetModules.length > 0 && !banner.targetModules.some((key) => viewer.modules.includes(key))) return false;
      if (banner.target_roles.length > 0 && !banner.target_roles.includes(viewer.role)) return false;
      return true;
    })
    .map((banner) => ({
      id: banner.id!,
      title: banner.title,
      description: banner.description,
      badge: banner.type,
      date: banner.date,
      color: banner.color,
      iconName: banner.iconName || null,
      imageUrl: banner.imageUrl || null,
      linkUrl: banner.linkUrl || null,
      buttonLabel: banner.buttonLabel || null,
      dismissible: banner.dismissible,
    }));
}

// ── Painel Master ─────────────────────────────────────────────

export async function listAllBanners() {
  const { data, error } = await db.from('platform_banners').select('*').order('position').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data || []) as Row[]).map(toItem);
}

function toRow(body: Partial<BannerItem>): Row | { error: string } {
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const title = text(body.title, 80);
  if (!title) return { error: 'Informe o título do banner.' };
  const rawLink = text(body.linkUrl, 500);
  const link = normalizeBannerLink(rawLink);
  if (rawLink && !link) return { error: 'Destino inválido: use um caminho do sistema (ex.: /suporte) ou um link https://.' };
  const image = text(body.imageUrl, 500);
  if (image && !/^https:\/\//i.test(image)) return { error: 'Imagem inválida.' };
  const audience = AUDIENCES.includes(body.audience as BannerAudience) ? (body.audience as BannerAudience) : 'all';
  const tenants = Array.isArray(body.targetTenants) ? body.targetTenants.filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500) : [];
  if (audience === 'tenants' && tenants.length === 0) return { error: 'Escolha pelo menos uma empresa.' };
  const date = (value: unknown) => {
    if (typeof value !== 'string' || !value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  };
  const startsAt = date(body.startsAt);
  const endsAt = date(body.endsAt);
  if (startsAt === undefined || endsAt === undefined) return { error: 'Data inválida.' };
  if (startsAt && endsAt && endsAt <= startsAt) return { error: 'O fim precisa ser depois do início.' };

  return {
    title,
    description: text(body.description, 280),
    type: text(body.type, 30),
    date: text(body.date, 30),
    color: text(body.color, 120) || 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    icon_name: text(body.iconName, 30) || null,
    image_url: image || null,
    link_url: link,
    button_label: link ? text(body.buttonLabel, 30) || 'Saiba mais' : null,
    starts_at: startsAt,
    ends_at: endsAt,
    active: body.active !== false,
    audience,
    target_tenants: audience === 'tenants' ? tenants : [],
    target_modules: sanitizeModules(body.targetModules || []),
    target_roles: Array.isArray(body.target_roles) ? body.target_roles.filter((role) => ROLES.includes(role)) : [],
    dismissible: body.dismissible !== false,
    updated_at: new Date().toISOString(),
  };
}

export async function saveBanner(id: string | null, body: Partial<BannerItem>): Promise<BannerItem | { error: string }> {
  const row = toRow(body);
  if ('error' in row) return row as { error: string };
  if (id) {
    const { data, error } = await db.from('platform_banners').update(row).eq('id', id).select('*').maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Banner não encontrado.' };
    return toItem(data as Row);
  }
  // Novo banner entra no começo da fila.
  const { data: first } = await db.from('platform_banners').select('position').order('position').limit(1).maybeSingle();
  const { data, error } = await db.from('platform_banners').insert({ ...row, position: (Number(first?.position) || 0) - 1 }).select('*').single();
  if (error) return { error: error.message };
  return toItem(data as Row);
}

export async function deleteBanner(id: string) {
  const { error } = await db.from('platform_banners').delete().eq('id', id);
  return error ? { error: error.message } : { ok: true as const };
}

/** Nova ordem do carrossel (lista de ids na ordem desejada). */
export async function reorderBanners(ids: string[]) {
  const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  await Promise.all(valid.map((id, index) => db.from('platform_banners').update({ position: index }).eq('id', id)));
}

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function uploadBannerImage(file: { buffer: Buffer; type: string; size: number }): Promise<{ url: string } | { error: string }> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: 'Use uma imagem PNG, JPG, WEBP ou GIF.' };
  if (file.size > 3 * 1024 * 1024) return { error: 'A imagem pode ter no máximo 3 MB.' };
  const path = `banners/${randomUUID()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, file.buffer, { contentType: file.type });
  if (error) return { error: error.message };
  return { url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}
