import {
  MessageCircle,
  FileSpreadsheet,
  LayoutGrid,
  Mail,
  Globe,
  Zap,
} from 'lucide-react';

export const INTEGRATIONS = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business API',
    description: 'Integração oficial via Meta para envio de mensagens escaláveis e automação profissional.',
    icon: MessageCircle,
    category: 'Comunicação',
    status: 'pending', // Mudando para pendente para incentivar a configuração
    color: '#25D366'
  },
  {
    id: 'whatsapp-web',
    name: 'WhatsApp Web (Gratuito)',
    description: 'Conecte seu WhatsApp diretamente por QR Code, sem contratar gateways ou pagar mensalidade.',
    icon: Zap,
    category: 'Comunicação',
    status: 'not_connected',
    color: '#11c1d9'
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Exporte leads e dados de desempenho automaticamente para suas planilhas compartilhadas.',
    icon: FileSpreadsheet,
    category: 'Produtividade',
    status: 'not_connected',
    color: '#0F9D58'
  },
  {
    id: 'meta-ads',
    name: 'Meta (IG Direct & Messenger)',
    description: 'Centralize mensagens do Direct e Messenger. Sincronize leads do Facebook Ads automaticamente.',
    icon: LayoutGrid,
    category: 'Marketing',
    status: 'not_connected',
    color: '#1877F2'
  },
  {
    id: 'email',
    name: 'Email Marketing',
    description: 'Conecte seu e-mail comercial para rastrear taxas de abertura e histórico de respostas automaticamente.',
    icon: Mail,
    category: 'Comunicação',
    status: 'not_connected',
    color: '#EA4335'
  },
  {
    id: 'webhook',
    name: 'Webhooks Customizados',
    description: 'Crie integrações personalizadas com qualquer serviço externo usando nossa robusta API.',
    icon: Globe,
    category: 'Desenvolvimento',
    status: 'not_connected',
    color: '#3b82f6'
  }
];

export const CATEGORIES = ['Todos', 'Marketing', 'Comunicação', 'Produtividade', 'Desenvolvimento'];

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error';
export type WhatsAppWebConnectionState = 'idle' | 'waiting' | 'connected' | 'error';

export interface WaConfig { token: string; phoneId: string; wabaId: string }
export interface MetaConfig { pageToken: string; pageId: string; instagramId: string }
export interface WebConfig { name: string }
export interface WebhookConfig { url: string; secret: string }
