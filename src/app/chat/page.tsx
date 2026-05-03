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
  Circle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import { HelpCircle, Bell } from 'lucide-react';
import Link from 'next/link';
import styles from './chat.module.css';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface InternalMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
  is_read: boolean;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  // Selecionar usuário vindo da notificação
  useEffect(() => {
    const userIdFromUrl = searchParams.get('userId');
    if (userIdFromUrl) {
      setSelectedProfileId(userIdFromUrl);
    }
  }, [searchParams]);

  // Fetch profiles on mount
  useEffect(() => {
    async function fetchProfiles() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user?.id || '')
        .eq('status', 'ACTIVE');

      if (!error && data) {
        setProfiles(data);
      }
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

    const fetchMessages = async () => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('internal_chat')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedProfileId}),and(sender_id.eq.${selectedProfileId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data);
        // Marcar mensagens recebidas como lidas
        await supabase
          .from('internal_chat')
          .update({ is_read: true })
          .eq('receiver_id', user.id)
          .eq('sender_id', selectedProfileId)
          .eq('is_read', false);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`internal_chat_${user.id}_${selectedProfileId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'internal_chat'
      }, (payload) => {
        const newMessage = payload.new as InternalMessage;
        // Only add if it belongs to this conversation
        const isBelonging =
          (newMessage.sender_id === user.id && newMessage.receiver_id === selectedProfileId) ||
          (newMessage.sender_id === selectedProfileId && newMessage.receiver_id === user.id);

        if (isBelonging) {
          setMessages(prev => [...prev, newMessage]);
        }
      })
      .subscribe();

    return () => {
      if (supabase) supabase.removeChannel(channel);
    };
  }, [selectedProfileId, user]);

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
    return profiles.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [profiles, searchQuery]);

  const selectedProfile = useMemo(() => {
    return profiles.find(p => p.id === selectedProfileId);
  }, [profiles, selectedProfileId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !selectedProfileId || !user || !supabase) return;

    const textToSubmit = inputText;
    setInputText('');

    const { error } = await supabase
      .from('internal_chat')
      .insert([
        {
          sender_id: user.id,
          receiver_id: selectedProfileId,
          text: textToSubmit
        }
      ]);

    if (error) {
      console.error('Error sending message:', JSON.stringify(error, null, 2));
      alert('Erro ao enviar mensagem.');
    } else {
      // Criar notificação para o destinatário
      if (supabase) {
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

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return (parts[0]?.charAt(0) || '') + (parts[1]?.charAt(0) || '');
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
          <div className={styles.searchBar}>
            <Search size={18} opacity={0.5} />
            <input
              type="text"
              placeholder="Pesquisar colega..."
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
                  {getInitials(profile.name)}
                  <div className={styles.statusIndicator} />
                </div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{profile.name}</span>
                  <span className={styles.userRole}>{profile.role}</span>
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
                  {getInitials(selectedProfile.name)}
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
            </div>
            {selectedProfileId && (
              <button className={styles.actionBtn}><MoreVertical size={20} /></button>
            )}
          </div>
        </header>

        {selectedProfileId && selectedProfile ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className={styles.messagesArea}>
              {messages.length > 0 ? (
                messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`${styles.message} ${msg.sender_id === user?.id ? styles.sent : styles.received}`}
                  >
                    {msg.text}
                    <span className={styles.msgTime}>
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </motion.div>
                ))
              ) : (
                <div className={styles.emptyState}>
                  <p>Inicie uma conversa com {selectedProfile.name.split(' ')[0]}.</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
              <form className={styles.inputContainer} onSubmit={handleSendMessage}>
                <button type="button" className={styles.actionBtn}><Paperclip size={20} /></button>
                <button type="button" className={styles.actionBtn}><Smile size={20} /></button>
                <textarea
                  rows={1}
                  placeholder="Escreva sua mensagem..."
                  value={inputText}
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
                  disabled={!inputText.trim()}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '32px', borderRadius: '50%', marginBottom: '20px' }}>
              <MessageSquare size={64} color="#8b5cf6" />
            </div>
            <h3>Central de Chat Equipe</h3>
            <p>Selecione um membro da equipe para começar a conversar em tempo real.</p>
          </div>
        )}
      </main>
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
