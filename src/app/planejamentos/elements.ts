import type { ComponentType } from 'react';
import {
  Mail,
  Users,
  LayoutTemplate,
  Video,
  CreditCard,
  Gift,
  PartyPopper,
  FormInput,
  GitBranch,
  MousePointerClick,
  Phone,
  StickyNote,
  Image as ImageIcon,
} from 'lucide-react';
import {
  SiMeta,
  SiInstagram,
  SiGoogleads,
  SiTiktok,
  SiYoutube,
  SiWhatsapp,
} from 'react-icons/si';
import type { PlanningElementDef } from './types';

/**
 * Paleta de elementos do canvas. "brandIcon: true" usa o logo real da
 * ferramenta/rede (react-icons/si); os demais usam ícones genéricos do
 * lucide-react (já usado no resto do app). Qualquer coisa fora daqui é
 * resolvida por upload de imagem customizada (ver ElementPalette).
 */
export const PLANNING_ELEMENTS: PlanningElementDef[] = [
  // Tráfego
  { kind: 'traffic', iconKey: 'meta', label: 'Meta / Facebook', category: 'trafico', brandIcon: true, color: '#1877F2' },
  { kind: 'traffic', iconKey: 'instagram', label: 'Instagram', category: 'trafico', brandIcon: true, color: '#E4405F' },
  { kind: 'traffic', iconKey: 'google-ads', label: 'Google Ads', category: 'trafico', brandIcon: true, color: '#4285F4' },
  { kind: 'traffic', iconKey: 'tiktok', label: 'TikTok', category: 'trafico', brandIcon: true, color: '#111827' },
  { kind: 'traffic', iconKey: 'youtube', label: 'YouTube', category: 'trafico', brandIcon: true, color: '#FF0000' },
  { kind: 'traffic', iconKey: 'whatsapp', label: 'WhatsApp', category: 'trafico', brandIcon: true, color: '#25D366' },
  { kind: 'traffic', iconKey: 'email', label: 'E-mail', category: 'trafico', color: '#64748b' },
  { kind: 'traffic', iconKey: 'organico', label: 'Tráfego orgânico', category: 'trafico', color: '#10b981' },
  // Páginas
  { kind: 'page', iconKey: 'landing-page', label: 'Página de Captura', category: 'paginas', color: '#3b82f6' },
  { kind: 'page', iconKey: 'vsl', label: 'Página de VSL', category: 'paginas', color: '#8b5cf6' },
  { kind: 'page', iconKey: 'checkout', label: 'Checkout', category: 'paginas', color: '#f59e0b' },
  { kind: 'page', iconKey: 'upsell', label: 'Upsell / Oferta', category: 'paginas', color: '#ec4899' },
  { kind: 'page', iconKey: 'obrigado', label: 'Página de Obrigado', category: 'paginas', color: '#10b981' },
  // Ações / Lógica
  { kind: 'action', iconKey: 'formulario', label: 'Formulário', category: 'acoes', color: '#60a5fa' },
  { kind: 'action', iconKey: 'decisao', label: 'Decisão (Sim/Não)', category: 'acoes', color: '#f59e0b' },
  { kind: 'action', iconKey: 'clique', label: 'Clique / CTA', category: 'acoes', color: '#3b82f6' },
  { kind: 'action', iconKey: 'chamada', label: 'Ligação', category: 'acoes', color: '#10b981' },
  // Nota
  { kind: 'note', iconKey: 'sticky-note', label: 'Nota', category: 'nota', color: '#fbbf24' },
  // Mídia
  { kind: 'image', iconKey: 'image', label: 'Imagem / Logo customizado', category: 'midia', color: '#94a3b8' },
];

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string; className?: string }>> = {
  meta: SiMeta,
  instagram: SiInstagram,
  'google-ads': SiGoogleads,
  tiktok: SiTiktok,
  youtube: SiYoutube,
  whatsapp: SiWhatsapp,
  email: Mail,
  organico: Users,
  'landing-page': LayoutTemplate,
  vsl: Video,
  checkout: CreditCard,
  upsell: Gift,
  obrigado: PartyPopper,
  formulario: FormInput,
  decisao: GitBranch,
  clique: MousePointerClick,
  chamada: Phone,
  'sticky-note': StickyNote,
  image: ImageIcon,
};

export function resolvePlanningIcon(iconKey?: string) {
  if (!iconKey) return ImageIcon;
  return ICON_MAP[iconKey] || ImageIcon;
}

export function findElementDef(iconKey?: string): PlanningElementDef | undefined {
  return PLANNING_ELEMENTS.find((el) => el.iconKey === iconKey);
}

export const ELEMENT_CATEGORIES: { id: PlanningElementDef['category']; label: string }[] = [
  { id: 'trafico', label: 'Tráfego' },
  { id: 'paginas', label: 'Páginas' },
  { id: 'acoes', label: 'Ações / Lógica' },
  { id: 'nota', label: 'Nota' },
  { id: 'midia', label: 'Mídia' },
];
