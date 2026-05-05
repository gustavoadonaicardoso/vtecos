"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Send,
  User,
  MoreVertical,
  MessageSquare,
  ChevronLeft,
  X,
  Smile,
  Paperclip,
  Circle,
  Trash2,
  Users as UsersIcon,
  Plus,
  LogOut,
  Camera,
  FileText,
  Pencil,
  Pin,
  PinOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import { HelpCircle, Bell } from 'lucide-react';
import Link from 'next/link';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import styles from './chat.module.css';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isGroup?: boolean;
  createdBy?: string;
  avatar_url?: string;
}

interface InternalMessage {
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

function ChatContent() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [hiddenMsgIds, setHiddenMsgIds] = useState<Set<string>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<Set<string>>(new Set());
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(new Set());
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Selecionar usuário vindo da notificação
  useEffect(() => {
    const userIdFromUrl = searchParams.get('userId');
    if (userIdFromUrl) {
      setSelectedProfileId(userIdFromUrl);
    }
  }, [searchParams]);

  // Carregar mensagens ocultas do localStorage
  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem(`chat_hidden_msgs_${user.id}`);
    if (stored) {
      setHiddenMsgIds(new Set(JSON.parse(stored)));
    }
  }, [user]);

  // Fetch profiles on mount
  useEffect(() => {
    async function fetchProfiles() {
      if (!supabase || !user) return;
      const { data: pData, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .eq('status', 'ACTIVE');

      let allProfiles = pData || [];

      const { data: gData, error: gError } = await supabase
        .from('chat_group_members')
        .select('group_id, chat_groups(id, name, created_by, avatar_url)')
        .eq('user_id', user.id);

      if (!gError && gData) {
        const groupsAsProfiles = gData
          .filter((g: any) => g.chat_groups)
          .map((g: any) => ({
            id: g.chat_groups.id,
            name: g.chat_groups.name,
            email: 'Grupo',
            role: 'Grupo',
            status: 'ACTIVE',
            isGroup: true,
            createdBy: g.chat_groups.created_by,
            avatar_url: g.chat_groups.avatar_url
          }));
        allProfiles = [...allProfiles, ...groupsAsProfiles];
      }

      setProfiles(allProfiles);
      setLoading(false);
    }
    fetchProfiles();
  }, [user]);

  // Fetch messages and subscribe to real-time
  useEffect(() => {
    if (!selectedProfileId || !user || !supabase) {
      setMessages([]);
      return;
    }

    const isGroup = profiles.find(p => p.id === selectedProfileId)?.isGroup;

    const fetchMessages = async () => {
      if (!supabase) return;

      if (isGroup) {
        const { data, error } = await supabase
          .from('chat_group_messages')
          .select('*, profiles(name)')
          .eq('group_id', selectedProfileId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setMessages(data as any[]);
        }
      } else {
        const { data, error } = await supabase
          .from('internal_chat')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedProfileId}),and(sender_id.eq.${selectedProfileId},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setMessages(data);
          await supabase
            .from('internal_chat')
            .update({ is_read: true })
            .eq('receiver_id', user.id)
            .eq('sender_id', selectedProfileId)
            .eq('is_read', false);
        }
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const tableName = isGroup ? 'chat_group_messages' : 'internal_chat';

    const channel = supabase
      .channel(`chat_${user.id}_${selectedProfileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: tableName
      }, async (payload) => {
        if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          return;
        }

        let newMessage = payload.new as any;

        if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === newMessage.id ? { ...m, text: newMessage.text, is_edited: newMessage.is_edited } : m));
          return;
        }

        if (isGroup) {
          if (newMessage.group_id === selectedProfileId) {
            if (newMessage.sender_id && !newMessage.profiles) {
              const { data: pData } = await supabase.from('profiles').select('name').eq('id', newMessage.sender_id).single();
              if (pData) newMessage.profiles = { name: pData.name };
            }
            setMessages(prev => [...prev, newMessage]);
          }
        } else {
          const isBelonging =
            (newMessage.sender_id === user.id && newMessage.receiver_id === selectedProfileId) ||
            (newMessage.sender_id === selectedProfileId && newMessage.receiver_id === user.id);

          if (isBelonging) {
            setMessages(prev => [...prev, newMessage]);
          }
        }
      })
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [selectedProfileId, user, profiles]);

  // Realtime System Notifications
  useEffect(() => {
    if (!user || !supabase) return;

    const fetchCount = async () => {
      const { count, error } = await supabase
        .from('system_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (!error) setUnreadCount(count || 0);
    };

    fetchCount();

    const channel = supabase
      .channel('chat_system_notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'system_notifications',
        filter: `user_id=eq.${user.id}`
      }, () => fetchCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredProfiles = useMemo(() => {
    let filtered = profiles.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
    filtered.sort((a, b) => {
      const aPinned = pinnedChats.has(a.id);
      const bPinned = pinnedChats.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
    return filtered;
  }, [profiles, searchQuery, pinnedChats]);

  const selectedProfile = useMemo(() => {
    return profiles.find(p => p.id === selectedProfileId);
  }, [profiles, selectedProfileId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedProfileId || !user || !supabase) return;

    const textToSubmit = inputText;

    const isGroup = selectedProfile?.isGroup;
    const table = isGroup ? 'chat_group_messages' : 'internal_chat';

    if (editingMsgId) {
      const { error } = await supabase.from(table).update({ text: textToSubmit, is_edited: true }).eq('id', editingMsgId);
      if (!error) {
        setMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, text: textToSubmit, is_edited: true } : m));
      } else {
        alert('Erro ao editar mensagem: ' + error.message);
      }
      setEditingMsgId(null);
      setInputText('');
      return;
    }

    setInputText('');

    const payload = isGroup
      ? { sender_id: user.id, group_id: selectedProfileId, text: textToSubmit }
      : { sender_id: user.id, receiver_id: selectedProfileId, text: textToSubmit };

    const { error } = await supabase.from(table).insert([payload]);

    if (error) {
      console.error('Error sending message:', JSON.stringify(error, null, 2));
      alert('Erro ao enviar mensagem.');
    } else {
      if (supabase && !isGroup) {
        await supabase.from('system_notifications').insert([{
          user_id: selectedProfileId,
          type: 'chat',
          title: 'Nova mensagem interna',
          content: `${user.name} enviou uma mensagem no chat interno.`,
          link: `/chat?userId=${user.id}`
        }]);
      }
    }
  };

  const handleDeleteMessage = async () => {
    if (!deletingMsgId || !user || !supabase) return;
    const isGroup = selectedProfile?.isGroup;
    const table = isGroup ? 'chat_group_messages' : 'internal_chat';

    const { error } = await supabase.from(table).delete().eq('id', deletingMsgId);
    if (!error) {
      setMessages(prev => prev.filter(m => m.id !== deletingMsgId));
    } else {
      alert('Erro ao excluir mensagem: ' + error.message);
    }
    setDeletingMsgId(null);
  };

  const handleDeleteChat = async () => {
    if (!deletingProfileId || !user || !supabase) return;

    const profileToDelete = profiles.find(p => p.id === deletingProfileId);
    const isGroup = profileToDelete?.isGroup;

    if (isGroup) {
      if (profileToDelete.createdBy === user.id) {
        const { error } = await supabase.from('chat_groups').delete().eq('id', deletingProfileId);
        if (error) {
          alert('Erro ao excluir grupo: ' + error.message);
        } else {
          setProfiles(prev => prev.filter(p => p.id !== deletingProfileId));
        }
      } else {
        const { error } = await supabase.from('chat_group_members')
          .delete()
          .eq('group_id', deletingProfileId)
          .eq('user_id', user.id);
        if (error) {
          alert('Erro ao sair do grupo: ' + error.message);
        } else {
          setProfiles(prev => prev.filter(p => p.id !== deletingProfileId));
        }
      }
    } else {
      const { error } = await supabase
        .from('internal_chat')
        .delete()
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${deletingProfileId}),and(sender_id.eq.${deletingProfileId},receiver_id.eq.${user.id})`);
      if (error) {
        alert('Erro ao excluir conversa: ' + error.message);
      }
    }

    if (selectedProfileId === deletingProfileId) {
      setMessages([]);
      setSelectedProfileId(null);
    }
    setDeletingProfileId(null);
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return (parts[0]?.charAt(0) || '') + (parts[1]?.charAt(0) || '');
  };

  const groupMessagesByDate = (msgs: InternalMessage[]) => {
    const groups: { [date: string]: InternalMessage[] } = {};
    msgs.forEach(msg => {
      if (hiddenMsgIds.has(msg.id)) return;
      const date = new Date(msg.created_at).toLocaleDateString('pt-BR');
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
    });
    return groups;
  };

  const groupedMessages = useMemo(() => groupMessagesByDate(messages), [messages, hiddenMsgIds]);

  const renderMessageText = (text: string) => {
    const fileMatch = text.match(/^\[ARQUIVO:\s*(.+?)\|(.+?)\]$/);
    if (fileMatch) {
      return (
        <a href={fileMatch[1]} target="_blank" rel="noopener noreferrer" className={styles.fileAttachment}>
          <Paperclip size={16} />
          <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileMatch[2]}
          </span>
        </a>
      );
    }
    return text;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedProfileId || !supabase) return;

    try {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `chat_attachments/${user.id}/${fileName}`;

      const { error } = await supabase.storage.from('files').upload(filePath, file);

      let fileUrl = '';
      if (error) {
        console.error('Storage error:', error);
        alert('Erro ao enviar arquivo. O bucket "files" pode não estar configurado.');
        setIsUploading(false);
        return;
      } else {
        const { data: publicUrlData } = supabase.storage.from('files').getPublicUrl(filePath);
        fileUrl = publicUrlData.publicUrl;
      }

      const isGroup = selectedProfile?.isGroup;
      const table = isGroup ? 'chat_group_messages' : 'internal_chat';
      const payload = isGroup
        ? { sender_id: user.id, group_id: selectedProfileId, text: inputText }
        : { sender_id: user.id, receiver_id: selectedProfileId, text: inputText };

      await supabase.from(table).insert([payload]);
    } catch (err) {
      console.error(err);
      alert('Erro inesperado no envio de arquivo.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEmojiClick = (emojiData: any) => {
    setInputText(prev => prev + emojiData.emoji);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || newGroupMembers.size === 0 || !user || !supabase) return;

    const { data: groupData, error: groupError } = await supabase
      .from('chat_groups')
      .insert([{ name: newGroupName, created_by: user.id }])
      .select()
      .single();

    if (groupError || !groupData) {
      const errStr = JSON.stringify(groupError, null, 2);
      console.error('Erro detalhado ao criar grupo:', errStr !== '{}' ? errStr : groupError);
      alert('Erro ao criar grupo. ' + (groupError?.message || errStr));
      return;
    }

    const membersToInsert = Array.from(newGroupMembers).map(memberId => ({
      group_id: groupData.id,
      user_id: memberId
    }));
    membersToInsert.push({ group_id: groupData.id, user_id: user.id });

    const { error: membersError } = await supabase.from('chat_group_members').insert(membersToInsert);
    if (membersError) {
      console.error('Erro ao adicionar membros:', membersError);
      alert('Grupo criado, mas falhou ao adicionar membros: ' + membersError.message);
    }

    setProfiles(prev => [...prev, {
      id: groupData.id,
      name: groupData.name,
      email: 'Grupo',
      role: 'Grupo',
      status: 'ACTIVE',
      isGroup: true,
      createdBy: user.id
    }]);

    setShowNewGroupModal(false);
    setNewGroupName('');
    setNewGroupMembers(new Set());
    setSelectedProfileId(groupData.id);
  };

  const fetchGroupInfo = async () => {
    if (!selectedProfileId || !supabase) return;
    const { data } = await supabase
      .from('chat_group_members')
      .select('user_id, is_admin, profiles(name)')
      .eq('group_id', selectedProfileId);
    if (data) {
      setGroupMembers(data.map(d => ({
        id: d.user_id,
        name: d.profiles?.name || 'Desconhecido',
        isAdmin: d.is_admin || d.user_id === selectedProfile?.createdBy
      })));
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    if (!supabase || !selectedProfileId) return;
    await supabase.from('chat_group_members').update({ is_admin: true }).eq('group_id', selectedProfileId).eq('user_id', userId);
    setGroupMembers(prev => prev.map(m => m.id === userId ? { ...m, isAdmin: true } : m));
  };

  const handleRevokeAdmin = async (userId: string) => {
    if (!supabase || !selectedProfileId) return;
    await supabase.from('chat_group_members').update({ is_admin: false }).eq('group_id', selectedProfileId).eq('user_id', userId);
    setGroupMembers(prev => prev.map(m => m.id === userId ? { ...m, isAdmin: false } : m));
  };

  const handleGroupAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedProfileId || !supabase) return;
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `chat_attachments/${user.id}/group_avatar_${selectedProfileId}_${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('files').upload(filePath, file);
      if (!error) {
        const { data } = supabase.storage.from('files').getPublicUrl(filePath);
        await supabase.from('chat_groups').update({ avatar_url: data.publicUrl }).eq('id', selectedProfileId);
        setProfiles(prev => prev.map(p => p.id === selectedProfileId ? { ...p, avatar_url: data.publicUrl } : p));
      } else {
        console.error('Storage Error:', error);
        alert('Erro ao enviar imagem: ' + error.message);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`pinned_chats_${user.id}`);
      if (saved) setPinnedChats(new Set(JSON.parse(saved)));
    }
  }, [user]);

  const togglePinChat = (profileId: string) => {
    if (!user) return;
    setPinnedChats(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      localStorage.setItem(`pinned_chats_${user.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  if (loading) {
    return <div className={styles.container}><div className={styles.emptyState}>Carregando usuários...</div></div>;
  }

  return (
    <div className={styles.container}>
      {/* SIDEBAR */}
      <aside className={`${styles.sidebar} ${selectedProfileId ? styles.hiddenOnMobile : ''}`}>
        <div className={styles.sidebarHeader}>
          <h2>Chat Interno</h2>
          <button
            className={styles.actionBtn}
            onClick={() => setShowNewGroupModal(true)}
            title="Novo Grupo"
          >
            <UsersIcon size={20} />
          </button>
        </div>
        <div style={{ padding: '0 16px 12px 16px' }}>
          <div className={styles.searchBar}>
            <Search size={18} opacity={0.5} />
            <input
              type="text"
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.userList}>
          {filteredProfiles.length > 0 ? (
            filteredProfiles.map(profile => (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`${styles.userItem} ${selectedProfileId === profile.id ? styles.userItemActive : ''}`}
                onClick={() => setSelectedProfileId(profile.id)}
              >
                <div className={styles.userAvatar}>
                  {profile.isGroup ? (
                    profile.avatar_url ? <img src={profile.avatar_url} alt="Group" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UsersIcon size={20} />
                  ) : getInitials(profile.name)}
                  {!profile.isGroup && <div className={styles.statusIndicator} />}
                </div>
                <div className={styles.userInfo}>
                  <span className={styles.userName} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {profile.name}
                    {pinnedChats.has(profile.id) && <Pin size={12} style={{ opacity: 0.6, transform: 'rotate(45deg)' }} />}
                  </span>
                  <span className={styles.userRole}>{profile.role}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); togglePinChat(profile.id); }}
                    title={pinnedChats.has(profile.id) ? "Desfixar conversa" : "Fixar conversa"}
                  >
                    {pinnedChats.has(profile.id) ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => { e.stopPropagation(); setDeletingProfileId(profile.id); }}
                    title={profile.isGroup && profile.createdBy !== user?.id ? "Sair do grupo" : "Apagar"}
                  >
                    {profile.isGroup && profile.createdBy !== user?.id ? <LogOut size={15} /> : <Trash2 size={15} />}
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className={styles.emptyState} style={{ opacity: 0.3, fontSize: '0.8rem' }}>
              Nenhum colega encontrado.
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className={`${styles.mainChat} ${!selectedProfileId ? styles.hiddenOnMobile : ''}`}>

        {/* UNIFIED HEADER FOR THE MODULE */}
        <header className={styles.chatHeader}>
          <div className={styles.headerInfo}>
            {selectedProfileId && (
              <button
                className={`${styles.actionBtn} ${styles.hideOnDesktop}`}
                onClick={() => setSelectedProfileId(null)}
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {selectedProfile ? (
              <>
                <div className={styles.userAvatar} style={{ width: 40, height: 40 }}>
                  {selectedProfile.isGroup ? (
                    selectedProfile.avatar_url ? <img src={selectedProfile.avatar_url} alt="Group" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UsersIcon size={20} />
                  ) : getInitials(selectedProfile.name)}
                  {!selectedProfile.isGroup && <div className={styles.statusIndicator} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedProfile.name}</h3>
                  <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Online</span>
                </div>
              </>
            ) : (
              <h3 style={{ margin: 0, fontSize: '1.2rem', opacity: 0.8 }}>Mensagens do Sistema</h3>
            )}
          </div>

          <div className={styles.systemTools}>
            <ThemeToggle />
            <Link href="/help" className={styles.systemIcon}>
              <HelpCircle size={22} opacity={0.6} />
            </Link>
            <div className={styles.notificationWrapper}>
              <button
                className={styles.systemIcon}
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={20} opacity={unreadCount > 0 ? 1 : 0.6} />
                {unreadCount > 0 && (
                  <span className={styles.systemBadge}>{unreadCount}</span>
                )}
              </button>
              <NotificationDropdown
                isOpen={showNotifications}
                onClose={() => setShowNotifications(false)}
              />
              {selectedProfile?.isGroup && (
                <button
                  className={styles.actionBtn}
                  onClick={() => {
                    fetchGroupInfo();
                    setShowGroupInfoModal(true);
                  }}
                  title="Informações do Grupo"
                >
                  <MoreVertical size={20} />
                </button>
              )}
            </div>
          </div>
        </header>

        <div className={styles.chatMainWrapper}>
          {selectedProfileId && selectedProfile ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
              <div className={styles.messagesArea}>
                {Object.keys(groupedMessages).length > 0 ? (
                  Object.entries(groupedMessages).map(([date, msgs]) => (
                    <React.Fragment key={date}>
                      <div className={styles.dateDivider}>
                        <span>{date === new Date().toLocaleDateString('pt-BR') ? 'Hoje' : date}</span>
                      </div>
                      {msgs.map((msg) => {
                        const isSent = msg.sender_id === user?.id;
                        return (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`${styles.msgWrapper} ${isSent ? styles.msgWrapperSent : styles.msgWrapperReceived}`}
                          >
                            <div className={`${styles.message} ${isSent ? styles.sent : styles.received}`}>
                              {msg.profiles?.name && !isSent && selectedProfile?.isGroup && (
                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px', opacity: 0.8 }}>
                                  {msg.profiles.name}
                                </div>
                              )}
                              {renderMessageText(msg.text)}
                              <span className={styles.msgTime}>
                                {msg.is_edited && <span style={{ fontStyle: 'italic', marginRight: '6px', opacity: 0.8 }}>Editada</span>}
                                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {isSent && (
                                <button
                                  className={styles.msgDeleteBtn}
                                  onClick={() => { setEditingMsgId(msg.id); setInputText(msg.text); }}
                                  title="Editar mensagem"
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                              <button
                                className={styles.msgDeleteBtn}
                                onClick={() => setDeletingMsgId(msg.id)}
                                title="Apagar mensagem"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </React.Fragment>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <p>Inicie uma conversa com {selectedProfile.name.split(' ')[0]}.</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className={styles.inputArea}>
                {editingMsgId && (
                  <div style={{ padding: '8px 16px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
                      <Pencil size={14} />
                      <span style={{ fontSize: '0.85rem' }}>Editando mensagem...</span>
                    </div>
                    <button onClick={() => { setEditingMsgId(null); setInputText(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--foreground)', opacity: 0.6 }}>
                      <X size={16} />
                    </button>
                  </div>
                )}
                {showEmojiPicker && (
                  <div className={styles.emojiPickerContainer}>
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      theme={Theme.AUTO}
                      searchPlaceHolder="Buscar emoji..."
                    />
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                <form className={styles.inputContainer} onSubmit={handleSendMessage}>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Paperclip size={20} />
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    <Smile size={20} />
                  </button>
                  <textarea
                    rows={1}
                    placeholder={isUploading ? "Enviando arquivo..." : "Escreva sua mensagem..."}
                    value={inputText}
                    disabled={isUploading}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className={styles.sendBtn}
                    disabled={(!inputText.trim() && !isUploading) || isUploading}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <UsersIcon size={48} opacity={0.2} />
              <h3>Bem-vindo ao Chat Interno</h3>
              <p>Selecione um colega ou grupo na barra lateral para começar a conversar.</p>
            </div>
          )}

          <AnimatePresence>
            {showGroupInfoModal && selectedProfile?.isGroup && (
              <motion.aside
                className={styles.infoSidebar}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 350, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
              >
                <div className={styles.infoHeader}>
                  <button className={styles.actionBtn} onClick={() => setShowGroupInfoModal(false)}>
                    <X size={20} />
                  </button>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Dados do grupo</h3>
                </div>

                <div className={styles.infoSection} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '8px solid rgba(255,255,255,0.02)' }}>
                  <div
                    style={{ width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', marginBottom: '16px' }}
                    onClick={() => groupAvatarInputRef.current?.click()}
                    title="Alterar foto do grupo"
                  >
                    {selectedProfile.avatar_url ? (
                      <img src={selectedProfile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Avatar" />
                    ) : <Camera size={48} opacity={0.5} />}
                    <div style={{ position: 'absolute', bottom: 0, background: 'rgba(0,0,0,0.5)', width: '100%', textAlign: 'center', fontSize: '12px', padding: '6px 0', fontWeight: 600, color: 'white' }}>
                      ADICIONAR FOTO
                    </div>
                  </div>
                  <input type="file" ref={groupAvatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleGroupAvatarUpload} />
                  <h2 style={{ fontSize: '1.4rem', margin: '0 0 4px 0' }}>{selectedProfile.name}</h2>
                  <span style={{ fontSize: '0.9rem', opacity: 0.6 }}>Grupo · {groupMembers.length} participantes</span>
                </div>

                <div className={styles.infoSection}>
                  <h4>Membros do Grupo</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {groupMembers.map(m => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-color, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>
                            {getInitials(m.name)}
                          </div>
                          <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                            {m.name} {m.id === user?.id && <span style={{ opacity: 0.6 }}>(Você)</span>}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {m.isAdmin ? (
                            <>
                              <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>Admin</span>
                              {groupMembers.find(g => g.id === user?.id)?.isAdmin && m.id !== selectedProfile?.createdBy && (
                                <button onClick={() => handleRevokeAdmin(m.id)} style={{ fontSize: '0.7rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.7 }}>Remover</button>
                              )}
                            </>
                          ) : (
                            groupMembers.find(g => g.id === user?.id)?.isAdmin && (
                              <button onClick={() => handleMakeAdmin(m.id)} style={{ fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', transition: 'all 0.2s' }}>Tornar Admin</button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.infoSection}>
                  <h4>Arquivos e Mídia</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {messages.filter(m => m.text.match(/^\[ARQUIVO:\s*(.+?)\|(.+?)\]$/)).map(m => {
                      const fileMatch = m.text.match(/^\[ARQUIVO:\s*(.+?)\|(.+?)\]$/);
                      return fileMatch ? (
                        <a key={m.id} href={fileMatch[1]} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: 'var(--foreground)', textDecoration: 'none', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: '8px', transition: 'all 0.2s' }}>
                          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px' }}>
                            <FileText size={18} />
                          </div>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{fileMatch[2]}</span>
                        </a>
                      ) : null;
                    })}
                    {messages.filter(m => m.text.match(/^\[ARQUIVO:\s*(.+?)\|(.+?)\]$/)).length === 0 && (
                      <span style={{ fontSize: '0.9rem', opacity: 0.5, fontStyle: 'italic' }}>Nenhum arquivo foi enviado ainda.</span>
                    )}
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {deletingMsgId && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeletingMsgId(null)}
          >
            <motion.div
              className={styles.modalContent}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalIcon}>
                <Trash2 size={28} />
              </div>
              <h3>Apagar mensagem</h3>
              <p>A mensagem será removida da sua visualização. O histórico no banco de dados não será afetado.</p>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setDeletingMsgId(null)}>
                  Cancelar
                </button>
                <button className={styles.confirmDeleteBtn} onClick={handleDeleteMessage}>
                  Apagar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingProfileId && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeletingProfileId(null)}
          >
            <motion.div
              className={styles.modalContent}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalIcon}>
                {profiles.find(p => p.id === deletingProfileId)?.isGroup && profiles.find(p => p.id === deletingProfileId)?.createdBy !== user?.id ? <LogOut size={28} /> : <Trash2 size={28} />}
              </div>
              <h3>
                {profiles.find(p => p.id === deletingProfileId)?.isGroup && profiles.find(p => p.id === deletingProfileId)?.createdBy !== user?.id
                  ? 'Sair do grupo'
                  : 'Apagar conversa'}
              </h3>
              <p>
                {profiles.find(p => p.id === deletingProfileId)?.isGroup && profiles.find(p => p.id === deletingProfileId)?.createdBy !== user?.id
                  ? `Tem certeza que deseja sair do grupo ${profiles.find(p => p.id === deletingProfileId)?.name}? Você não receberá mais mensagens dele.`
                  : `Todas as mensagens com ${profiles.find(p => p.id === deletingProfileId)?.name} serão apagadas permanentemente. Esta ação não pode ser desfeita.`
                }
              </p>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setDeletingProfileId(null)}>
                  Cancelar
                </button>
                <button className={styles.confirmDeleteBtn} onClick={handleDeleteChat}>
                  {profiles.find(p => p.id === deletingProfileId)?.isGroup && profiles.find(p => p.id === deletingProfileId)?.createdBy !== user?.id ? 'Sair' : 'Apagar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewGroupModal && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowNewGroupModal(false)}
          >
            <motion.div
              className={styles.modalContent}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalIcon} style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                <UsersIcon size={28} />
              </div>
              <h3>Criar Novo Grupo</h3>
              <input
                type="text"
                placeholder="Nome do grupo..."
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'inherit', marginBottom: '12px' }}
              />
              <div style={{ width: '100%', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', textAlign: 'left' }}>
                {profiles.filter(p => !p.isGroup).map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newGroupMembers.has(p.id)}
                      onChange={(e) => {
                        const newSet = new Set(newGroupMembers);
                        if (e.target.checked) newSet.add(p.id);
                        else newSet.delete(p.id);
                        setNewGroupMembers(newSet);
                      }}
                    />
                    <span style={{ fontSize: '0.9rem' }}>{p.name}</span>
                  </label>
                ))}
              </div>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowNewGroupModal(false)}>
                  Cancelar
                </button>
                <button
                  className={styles.confirmDeleteBtn}
                  style={{ background: '#3b82f6' }}
                  onClick={handleCreateGroup}
                  disabled={!newGroupName.trim() || newGroupMembers.size === 0}
                >
                  Criar Grupo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function ChatInternoPage() {
  return (
    <Suspense fallback={<div className={styles.container}><div className={styles.emptyState}>Carregando chat...</div></div>}>
      <ChatContent />
    </Suspense>
  );
}
