export interface MasterSettings {
  siteName: string;
  primaryColor: string;
  accentColor: string;
  bgColor: string;
  logoText: string;
  logoUrl: string;
  faviconUrl: string;
  sidebarBg: string;
}

export type TabId = 'branding' | 'modules' | 'permissions' | 'tenants' | 'banners';

export type Role = 'ADMIN' | 'MANAGER' | 'SELLER';

export type RolePermissions = Record<string, Record<string, Record<string, boolean>>>;

export interface BannerItem {
  id?: string;
  title: string;
  description: string;
  date: string;
  type: string;
  color: string;
  iconName?: string;
  target_roles: string[];
}

export interface Tenant {
  id: string;
  name: string;
  status: string;
  created_at: string;
}
