export interface ChatMessage {
  id: string | number;
  type: 'text' | 'audio';
  text?: string;
  audioUrl?: string;
  sent: boolean;
  status?: 'sending' | 'sent' | 'received' | 'failed';
  time: string;
}

export interface ChatListItem {
  id: string;
  name: string;
  text: string;
  time: string;
  unread: number;
  type: string;
  color: string;
  avatar: string;
}

export interface QuickTemplate {
  id: string;
  name: string;
  content: string;
}

export interface MetaTemplate {
  id: string;
  name: string;
  text: string;
}

export interface NewContactForm {
  name: string;
  phone: string;
  email: string;
  stage: string;
}

export interface LeadEditForm {
  name: string;
  email: string;
  phone: string;
  value: string;
  stage: string;
}
