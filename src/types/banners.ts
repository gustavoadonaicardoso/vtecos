// ─── Banners da Plataforma ────────────────────────────────────

export interface PlatformBanner {
  id: string;
  title: string;
  description: string;
  date: string;
  type: string;
  color: string;
  iconName?: string;
  /** [] vazio = exibir para todos | ['SELLER'] = apenas sellers */
  target_roles: string[];
  is_active?: boolean;
  created_at?: string;
}
