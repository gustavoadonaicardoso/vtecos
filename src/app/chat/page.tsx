"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { Users as UsersIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import styles from './chat.module.css';
import type { Profile, InternalMessage, GroupMember } from './types';
import ChatHeader from './components/ChatHeader';
import ChatSidebar from './components/ChatSidebar';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import GroupInfoPanel from './components/GroupInfoPanel';
import DeleteMessageModal from './components/DeleteMessageModal';
import DeleteChatModal from './components/DeleteChatModal';
import NewGroupModal from './components/NewGroupModal';

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
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
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

  // Fetch profiles when the authenticated user is available
  useEffect(() => {
    async function fetchProfiles() {
      if (!supabase || !user) return;
      const profilesResponse = await fetch('/api/users?scope=chat', {
        headers: { 'x-user-id': user.id },
        cache: 'no-store',
      });
      const profilesJson = await profilesResponse.json().catch(() => ({}));
      const pData: Profile[] = profilesResponse.ok && Array.isArray(profilesJson.data)
        ? profilesJson.data as Profile[]
        : [];
      const pError = profilesResponse.ok
        ? null
        : new Error(profilesJson.error || 'Não foi possível carregar os usuários do chat.');

      if (pError) {
        console.error('Erro ao carregar usuários do chat:', pError);
      }

      let allProfiles = pData || [];

      // O usuário atual também deve aparecer na lista do chat interno.
      // O fallback mantém o próprio perfil visível se a lista retornar incompleta.
      if (!allProfiles.some(profile => profile.id === user.id)) {
        allProfiles = [
          {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            avatar_url: user.avatar_url || undefined,
          },
          ...allProfiles,
        ];
      }

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
    const msgType = isGroup ? 'group' : 'direct';

    // Edição de mensagem
    if (editingMsgId) {
      const res = await fetch('/api/chat/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: msgType, id: editingMsgId, text: textToSubmit }),
      });
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === editingMsgId ? { ...m, text: textToSubmit, is_edited: true } : m));
      } else {
        const r = await res.json();
        alert('Erro ao editar mensagem: ' + r.error);
      }
      setEditingMsgId(null);
      setInputText('');
      return;
    }

    setInputText('');

    const payload = isGroup
      ? { sender_id: user.id, group_id: selectedProfileId, text: textToSubmit }
      : { sender_id: user.id, receiver_id: selectedProfileId, text: textToSubmit };

    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: msgType, payload }),
    });

    if (!res.ok) {
      const r = await res.json();
      console.error('Error sending message:', r.error);
      alert('Erro ao enviar mensagem.');
    } else if (!isGroup && supabase) {
      // Notificação para mensagens diretas
      await supabase.from('system_notifications').insert([{
        user_id: selectedProfileId,
        type: 'chat',
        title: 'Nova mensagem interna',
        content: `${user.name} enviou uma mensagem no chat interno.`,
        link: `/chat?userId=${user.id}`
      }]);
    }
  };

  const handleDeleteMessage = async () => {
    if (!deletingMsgId || !user || !supabase) return;
    const isGroup = selectedProfile?.isGroup;
    const msgType = isGroup ? 'group' : 'direct';

    const res = await fetch('/api/chat/messages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: msgType, id: deletingMsgId }),
    });

    if (res.ok) {
      setMessages(prev => prev.filter(m => m.id !== deletingMsgId));
    } else {
      const r = await res.json();
      alert('Erro ao excluir mensagem: ' + r.error);
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

    const response = await fetch('/api/chat/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newGroupName.trim(),
        created_by: user.id,
        members: Array.from(newGroupMembers),
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.group) {
      console.error('Erro ao criar grupo:', result.error);
      alert('Erro ao criar grupo: ' + (result.error || 'Tente novamente.'));
      return;
    }

    const groupData = result.group;

    if (result.warning) {
      console.warn('Grupo criado, mas houve problema nos membros:', result.warning);
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
        name: (d.profiles as any)?.[0]?.name || 'Desconhecido',
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
      <ChatHeader
        selectedProfileId={selectedProfileId}
        selectedProfile={selectedProfile}
        onBack={() => setSelectedProfileId(null)}
        showNotifications={showNotifications}
        onToggleNotifications={() => setShowNotifications(!showNotifications)}
        onCloseNotifications={() => setShowNotifications(false)}
        unreadCount={unreadCount}
        onOpenGroupInfo={() => { fetchGroupInfo(); setShowGroupInfoModal(true); }}
      />

      <div className={styles.chatBody}>
        <ChatSidebar
          filteredProfiles={filteredProfiles}
          selectedProfileId={selectedProfileId}
          currentUserId={user?.id}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSelectProfile={setSelectedProfileId}
          onNewGroup={() => setShowNewGroupModal(true)}
          pinnedChats={pinnedChats}
          onTogglePin={togglePinChat}
          onRequestDelete={setDeletingProfileId}
          hiddenOnMobile={!!selectedProfileId}
        />

        {/* MAIN CHAT AREA */}
        <main className={`${styles.mainChat} ${!selectedProfileId ? styles.hiddenOnMobile : ''}`}>
          <div className={styles.chatMainWrapper}>
            {selectedProfileId && selectedProfile ? (
              <div className={styles.conversation}>
                <MessageList
                  groupedMessages={groupedMessages}
                  currentUserId={user?.id}
                  selectedProfile={selectedProfile}
                  onEditMessage={(messageId, text) => { setEditingMsgId(messageId); setInputText(text); }}
                  onRequestDeleteMessage={setDeletingMsgId}
                  messagesEndRef={messagesEndRef}
                />

                <MessageInput
                  editingMsgId={editingMsgId}
                  onCancelEdit={() => { setEditingMsgId(null); setInputText(''); }}
                  showEmojiPicker={showEmojiPicker}
                  onToggleEmojiPicker={() => setShowEmojiPicker(!showEmojiPicker)}
                  onEmojiClick={handleEmojiClick}
                  fileInputRef={fileInputRef}
                  onFileUpload={handleFileUpload}
                  isUploading={isUploading}
                  inputText={inputText}
                  onInputTextChange={setInputText}
                  onSendMessage={handleSendMessage}
                />
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
                <GroupInfoPanel
                  selectedProfile={selectedProfile}
                  groupMembers={groupMembers}
                  currentUserId={user?.id}
                  messages={messages}
                  groupAvatarInputRef={groupAvatarInputRef}
                  onGroupAvatarUpload={handleGroupAvatarUpload}
                  onMakeAdmin={handleMakeAdmin}
                  onRevokeAdmin={handleRevokeAdmin}
                  onClose={() => setShowGroupInfoModal(false)}
                />
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {deletingMsgId && (
          <DeleteMessageModal
            onCancel={() => setDeletingMsgId(null)}
            onConfirm={handleDeleteMessage}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingProfileId && (
          <DeleteChatModal
            targetProfile={profiles.find(p => p.id === deletingProfileId)}
            currentUserId={user?.id}
            onCancel={() => setDeletingProfileId(null)}
            onConfirm={handleDeleteChat}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewGroupModal && (
          <NewGroupModal
            profiles={profiles}
            newGroupName={newGroupName}
            onNameChange={setNewGroupName}
            newGroupMembers={newGroupMembers}
            onMembersChange={setNewGroupMembers}
            onCancel={() => setShowNewGroupModal(false)}
            onConfirm={handleCreateGroup}
          />
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
