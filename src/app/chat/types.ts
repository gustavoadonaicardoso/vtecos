export interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isGroup?: boolean;
  createdBy?: string;
  avatar_url?: string;
}

export interface InternalMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
  is_read: boolean;
  is_edited?: boolean;
  group_id?: string;
  profiles?: { name: string };
}

export interface GroupMember {
  id: string;
  name: string;
  isAdmin: boolean;
}
