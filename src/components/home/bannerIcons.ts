import { Award, Flame, Globe, Megaphone, Rocket, Shield, Sparkles, Star, Zap } from 'lucide-react';

/** Ícones que o Painel Master oferece para os banners (salvos pelo id em `icon_name`). */
export const BANNER_ICONS = [
  { id: 'zap', icon: Zap },
  { id: 'flame', icon: Flame },
  { id: 'rocket', icon: Rocket },
  { id: 'star', icon: Star },
  { id: 'shield', icon: Shield },
  { id: 'globe', icon: Globe },
  { id: 'award', icon: Award },
  { id: 'sparkles', icon: Sparkles },
  { id: 'megaphone', icon: Megaphone },
];

/** Busca por id (ex.: BANNER_ICON_MAP[banner.iconName]). */
export const BANNER_ICON_MAP: Record<string, (typeof BANNER_ICONS)[number]['icon']> = Object.fromEntries(
  BANNER_ICONS.map((item) => [item.id, item.icon])
);
