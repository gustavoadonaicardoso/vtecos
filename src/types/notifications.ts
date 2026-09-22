// ─── Notificações ─────────────────────────────────────────────

export interface SystemNotification {
  id: string;
  type: 'chat' | 'automation' | 'lead' | 'task' | 'system';
  title: string;
  content: string;
  created_at: string;
  is_read: boolean;
  user_id: string;
  link?: string;
}

// ─── Atividades / Feed ────────────────────────────────────────

export interface ActivityItem {
  id?: string;
  user_name: string;
  action: string;
  target?: string;
  icon_name?: string;
  created_at: string;
}
