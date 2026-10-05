export type MessageKind = 'text' | 'audio' | 'image' | 'document';
export type MessageStatus = 'sending' | 'sent' | 'received' | 'failed' | 'read' | 'delivered';

export interface ChatMessage {
  id: string;
  type: MessageKind;
  text: string;
  /** URL da mídia (imagem, documento ou áudio) -- coluna audio_url. */
  mediaUrl: string | null;
  sent: boolean;
  status: MessageStatus | null;
  createdAt: string;
  provider: string | null;
}

export interface QuickReply {
  id: string;
  name: string;
  content: string;
}

export type InboxTab = 'all' | 'unread' | 'mine' | 'unassigned';
