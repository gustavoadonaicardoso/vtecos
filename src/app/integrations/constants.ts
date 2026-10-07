import { FileSpreadsheet, Globe, MessageCircle, Phone, QrCode, Share2, Sparkles, UserPlus } from 'lucide-react';

export type Provider = 'whatsapp_meta' | 'webhook_custom' | 'google_sheets' | 'lead_capture' | 'twilio' | 'ai';

export interface CatalogItem {
  id: 'whatsapp-web' | 'whatsapp-api' | 'lead-capture' | 'webhooks' | 'google-sheets' | 'social' | 'twilio' | 'ai';
  provider: Provider | null;
  name: string;
  description: string;
  icon: typeof MessageCircle;
  color: string;
  category: 'WhatsApp' | 'Leads' | 'Automação' | 'Marketing' | 'Telefonia' | 'IA';
  /** Módulo do plano que precisa estar liberado. */
  module: string;
  /** Artigo da Central de Ajuda com o passo a passo (editável no Painel Master). */
  helpSlug: string;
}

export const CATALOG: CatalogItem[] = [
  {
    id: 'whatsapp-web',
    provider: null,
    name: 'WhatsApp Web',
    description: 'Conecte o WhatsApp da empresa lendo um QR Code. Sem custo de API.',
    icon: QrCode,
    color: '#25D366',
    category: 'WhatsApp',
    module: 'crm',
    helpSlug: 'integracao-whatsapp-web',
  },
  {
    id: 'whatsapp-api',
    provider: 'whatsapp_meta',
    name: 'WhatsApp Business API',
    description: 'Conexão oficial da Meta pelo login do Facebook: templates aprovados e mais estabilidade.',
    icon: MessageCircle,
    color: '#128C7E',
    category: 'WhatsApp',
    module: 'crm',
    helpSlug: 'integracao-whatsapp-api',
  },
  {
    id: 'lead-capture',
    provider: 'lead_capture',
    name: 'Captura de leads',
    description: 'Formulário do site, landing page ou outro sistema criando leads no funil.',
    icon: UserPlus,
    color: '#3b82f6',
    category: 'Leads',
    module: 'crm',
    helpSlug: 'integracao-captura-leads',
  },
  {
    id: 'webhooks',
    provider: 'webhook_custom',
    name: 'Webhooks',
    description: 'Avise Make, Zapier, n8n ou seu sistema a cada lead novo ou mensagem recebida.',
    icon: Globe,
    color: '#8b5cf6',
    category: 'Automação',
    module: 'crm',
    helpSlug: 'integracao-webhooks',
  },
  {
    id: 'google-sheets',
    provider: 'google_sheets',
    name: 'Google Sheets',
    description: 'Cada lead novo vira uma linha na sua planilha do Google.',
    icon: FileSpreadsheet,
    color: '#0F9D58',
    category: 'Automação',
    module: 'crm',
    helpSlug: 'integracao-google-sheets',
  },
  {
    id: 'social',
    provider: null,
    name: 'Instagram e Facebook',
    description: 'Agende e publique posts. A conexão é feita em Redes Sociais.',
    icon: Share2,
    color: '#E4405F',
    category: 'Marketing',
    module: 'social',
    helpSlug: 'conectar-redes-sociais',
  },
  {
    id: 'twilio',
    provider: 'twilio',
    name: 'Discador (Twilio)',
    description: 'Discador automático: liga para a sua planilha e passa para a equipe só quem atendeu. Também liga manualmente pelo navegador, com gravação.',
    icon: Phone,
    color: '#F22F46',
    category: 'Telefonia',
    module: 'crm',
    helpSlug: 'integracao-twilio',
  },
  {
    id: 'ai',
    provider: 'ai',
    name: 'Inteligência artificial',
    description: 'Atendente com IA, legendas e notas fiscais. Use a IA da Vórtice ou a sua chave do Gemini.',
    icon: Sparkles,
    color: '#8b5cf6',
    category: 'IA',
    module: 'crm',
    helpSlug: 'integracao-ia',
  },
];

export const CATEGORIES = ['Todos', 'WhatsApp', 'Leads', 'Automação', 'Marketing', 'Telefonia', 'IA'] as const;

export interface DeliveryInfo {
  ok: boolean;
  status: number | null;
  at: string;
  event: string;
  error?: string;
}

export interface IntegrationView {
  provider: Provider;
  config: Record<string, unknown>;
  secrets: Record<string, boolean>;
  updated_at: string | null;
}

export interface PlatformService {
  key: string;
  label: string;
  description: string;
  configured: boolean;
  missing: string[];
}

export interface Overview {
  integrations: IntegrationView[];
  whatsappWeb: { status: string; connected: boolean; qrCode: string | null; phone?: string | null; lastError?: string | null } | null;
  socialAccounts: number | null;
  platform: PlatformService[] | null;
  /** IA da Vórtice disponível para quem não tem chave própria. */
  platformAi: boolean;
  /** Botão "Conectar com Facebook" do WhatsApp oficial pronto. */
  whatsappSignup: boolean;
}

export type CardStatus = 'connected' | 'attention' | 'off';
