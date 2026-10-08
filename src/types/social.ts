export type SocialPlatform = 'facebook' | 'instagram';

export type SocialAccountStatus = 'active' | 'error' | 'disconnected';

/** Conta como o navegador enxerga: nunca inclui o access_token. */
export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  external_id: string;
  page_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  project_id: string | null;
  status: SocialAccountStatus;
  last_error: string | null;
  created_at: string;
  /** Recebimento de mensagens (Direct/Messenger) ligado na Página: 'on', 'error' ou null (nunca ligado). */
  messaging_status?: 'on' | 'error' | null;
  messaging_error?: string | null;
}

export type SocialPostStatus =
  | 'draft'
  | 'pending_approval'
  | 'rejected'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'published_late'
  | 'partial'
  | 'failed';

export type SocialTargetStatus = 'pending' | 'published' | 'failed';

export interface SocialMediaItem {
  url: string;
  width: number;
  height: number;
}

export interface SocialPostTarget {
  id: string;
  account_id: string;
  status: SocialTargetStatus;
  external_id: string | null;
  permalink: string | null;
  error: string | null;
  published_at: string | null;
}

export interface SocialPost {
  id: string;
  caption: string;
  media: SocialMediaItem[];
  status: SocialPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  project_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  targets: SocialPostTarget[];
}

/** Como o post deve sair do rascunho ao ser enviado. */
export type SocialSubmitMode = 'schedule' | 'now';

/** Guardado em integrations_config (provider 'social_settings'). */
export interface SocialSettings {
  /** Vendedores enviam para aprovação em vez de agendar/publicar direto. */
  requireApproval: boolean;
  /** Contas já marcadas ao abrir um post novo (vazio = todas as ativas). */
  defaultAccountIds: string[];
}

export interface SocialProjectOption {
  id: string;
  name: string;
}

/** Métricas normalizadas; null = a Meta não devolveu (métrica indisponível). */
export interface SocialMetrics {
  followers: number | null;
  reach: number | null;
  views: number | null;
  interactions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  follows: number | null;
}

export interface SocialInsightsPoint {
  date: string;
  value: number;
}

export interface SocialTopPost {
  postId: string;
  targetId: string;
  caption: string;
  thumbnail: string | null;
  permalink: string | null;
  publishedAt: string | null;
  metrics: SocialMetrics;
}

export interface SocialAccountInsights {
  accountId: string;
  days: number;
  totals: SocialMetrics;
  /** Série diária da métrica de alcance disponível. */
  series: SocialInsightsPoint[];
  topPosts: SocialTopPost[];
  fetchedAt: string;
}

export interface SocialTargetInsights {
  targetId: string;
  accountId: string;
  metrics: SocialMetrics | null;
  error: string | null;
}
