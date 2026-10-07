export interface MasterSettings {
  siteName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  faviconUrl: string;
  sidebarBg: string;
}

export type TabId = 'branding' | 'modules' | 'permissions' | 'tenants' | 'banners' | 'help' | 'platform' | 'status';

export type Role = 'ADMIN' | 'MANAGER' | 'SELLER';

export type RolePermissions = Record<string, Record<string, Record<string, boolean>>>;

export type { BannerItem } from '@/lib/banners';

export interface Tenant {
  id: string;
  name: string;
  status: string;
  created_at: string;
}
