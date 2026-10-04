import {
  BookOpen,
  Calculator,
  LifeBuoy,
  MessageCircle,
  Plug,
  Rocket,
  Settings,
  Share2,
  Shield,
  Star,
  Target,
  Ticket,
  Users,
  Zap,
} from 'lucide-react';

/** Ícones que o Painel Master oferece para as categorias da Ajuda (salvos pela chave). */
export const HELP_ICONS = {
  book: BookOpen,
  rocket: Rocket,
  message: MessageCircle,
  plug: Plug,
  share: Share2,
  calculator: Calculator,
  ticket: Ticket,
  target: Target,
  shield: Shield,
  users: Users,
  settings: Settings,
  zap: Zap,
  star: Star,
  help: LifeBuoy,
} as const;

export type HelpIconKey = keyof typeof HELP_ICONS;

export const HELP_ICON_KEYS: string[] = Object.keys(HELP_ICONS);
