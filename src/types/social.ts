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
