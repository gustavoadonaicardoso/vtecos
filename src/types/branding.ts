// ─── Configurações de Tema/Branding ──────────────────────────

export interface BrandingConfig {
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  favicon_url: string;
  app_name: string;
  sidebar_bg: string;
}

export type Theme = 'dark' | 'light';
