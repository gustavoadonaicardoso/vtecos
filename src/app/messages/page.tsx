"use client";

import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/lib/permissions';
import styles from './messages.module.css';
import { AnimatePresence } from 'framer-motion';
import { sendWhatsApp, saveChatMessage } from '@/lib/messaging';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, LeadEditForm, MetaTemplate, NewContactForm, QuickTemplate } from './types';
import ChatSidebar from './components/ChatSidebar';
import ChatHeaderMain from './components/ChatHeaderMain';
import MessageBubbleList from './components/MessageBubbleList';
import SendErrorBanner from './components/SendErrorBanner';
import MessageInputBar from './components/MessageInputBar';
import LeadInfoDrawer from './components/LeadInfoDrawer';
import EmptyChatState from './components/EmptyChatState';
import NewContactModal from './components/NewContactModal';

function MessagesContent() {
  const { leads, updateLead, pipelineStages, refreshDatabase } = useLeads();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const searchParams = useSearchParams();
  const initialChatId = searchParams.get('chatId');

  const [activeTab, setActiveTab] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Templates dinâmicos do banco
  const [quickTemplates, setQuickTemplates] = useState<QuickTemplate[]>([]);

  // Modal Novo Contato
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContact, setNewContact] = useState<NewContactForm>({ name: '', phone: '', email: '', stage: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState('');

  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId);
  const [inputText, setInputText] = useState('');

  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Popover States
  const [showEmoji, setShowEmoji] = useState(false);
  const [showQuickMsgs, setShowQuickMsgs] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [useSignature, setUseSignature] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState('WhatsApp');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<LeadEditForm>({
    name: '', email: '', phone: '', value: '0.00', stage: ''
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Audio States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Carrega templates do banco filtrados pela permissão do usuário
  useEffect(() => {
    if (!user) return;
    fetch(`/api/messages/templates?userId=${user.id}`)
      .then(r => r.json())
      .then(d => { if (d.templates) setQuickTemplates(d.templates); })
      .catch(() => {});
  }, [user]);

  const handleCreateContact = async () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) {
      setContactError('Nome e telefone são obrigatórios.');
      return;
    }
    if (!supabase) return;
    setSavingContact(true);
    setContactError('');

    const stageId = newContact.stage || pipelineStages[0]?.id || null;
    const { data, error } = await supabase
      .from('leads')
      .insert([{
        name: newContact.name.trim(),
        phone: newContact.phone.trim(),
        email: newContact.email.trim() || null,
        stage_id: stageId,
      }])
      .select()
      .single();

    setSavingContact(false);
    if (error) { setContactError(error.message); return; }
    setShowNewContact(false);
    setNewContact({ name: '', phone: '', email: '', stage: '' });
    await refreshDatabase();
    if (data) setSelectedChatId(data.id);
  };

  const MOCK_CHATS = useMemo(() => {
    return leads.map((lead, i) => {
      const assignedTab = i % 3 === 0 ? 'Aguardando' : (i % 5 === 0 ? 'Grupos' : 'Minhas Conversas');
      return {
        id: lead.id,
        name: lead.name,
        text: lead.lastMsg || 'Iniciar conversa...',
        time: lead.entryDate,
        unread: i % 4 === 0 ? 1 : 0,
        type: assignedTab,
        color: lead.color || '#3b82f6',
        avatar: lead.name.slice(0, 2).toUpperCase()
      };
    });
  }, [leads]);

  const filteredChats = useMemo(() => {
    return MOCK_CHATS.filter(chat =>
      (activeTab === 'Todos' || chat.type === activeTab || selectedChatId === chat.id) &&
      chat.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [MOCK_CHATS, activeTab, selectedChatId, searchQuery]);

  const selectedChat = useMemo(() => {
    return MOCK_CHATS.find(c => c.id === selectedChatId);
  }, [MOCK_CHATS, selectedChatId]);

  // Update edit form when chat changes or info opens
  useEffect(() => {
    const leadData = leads.find(l => l.id === selectedChatId);
    if (leadData) {
      setEditForm({
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        value: leadData.value?.replace('R$ ', '') || '0,00',
        stage: leadData.pipelineStage
      });
    }
  }, [selectedChatId, leads, showInfo]);

  const currentStageName = pipelineStages.find(s => s.id === editForm.stage)?.name || 'Sem Estágio';

  useEffect(() => {
    if (initialChatId) {
      setSelectedChatId(initialChatId);
      const chatTarget = MOCK_CHATS.find(c => c.id === initialChatId);
      if (chatTarget && chatTarget.type !== activeTab) {
        setActiveTab(chatTarget.type);
      }
    }
  }, [initialChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, selectedChatId, isRecording]);

  // Real-time Messages Fetching
  useEffect(() => {
    if (!selectedChatId || !supabase) return;
    const client = supabase; // Type-safe reference

    const fetchHistory = async () => {
      const { data, error } = await client
        .from('chat_messages')
        .select('*')
        .eq('lead_id', selectedChatId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setActiveMessages(data.map(m => ({
          id: m.id,
          type: m.type,
          text: m.text,
          audioUrl: m.audio_url,
          sent: m.sent_by_me,
          status: m.status || 'sent',
          time: new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        })));
      } else if (error) {
        console.error('Error fetching chat history:', error);
      }
    };

    fetchHistory();

    const mapMessage = (m: any) => ({
      id: m.id,
      type: m.type,
      text: m.text,
      audioUrl: m.audio_url,
      sent: m.sent_by_me,
      status: m.status || 'sent',
      time: new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    const channel = client
      .channel(`chat-${selectedChatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      }, (payload) => {
        const m = payload.new;
        if (m.lead_id === selectedChatId) {
          setActiveMessages(prev => {
            if (prev.some(msg => msg.id === m.id)) return prev;
            return [...prev, mapMessage(m)];
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages'
      }, (payload) => {
        const m = payload.new;
        if (m.lead_id === selectedChatId) {
          setActiveMessages(prev =>
            prev.map(msg => msg.id === m.id ? { ...msg, status: m.status } : msg)
          );
        }
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [selectedChatId]);

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
      .channel('messages_system_notifications')
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

  const [sendError, setSendError] = useState<string | null>(null);

  const handleSendMessage = async (textToOverride?: string) => {
    let finalMsg = textToOverride || inputText;
    if (!finalMsg.trim() || !selectedChatId) return;

    // Append Signature if enabled and not already present
    if (useSignature && user) {
      const signature = `\n- ${user.name}`;
      if (!finalMsg.includes(signature)) {
        finalMsg = finalMsg.trim() + signature;
      }
    }

    setInputText('');
    setShowEmoji(false);
    setShowQuickMsgs(false);
    setShowTemplates(false);
    setSendError(null);

    const targetLead = leads.find(l => l.id === selectedChatId);

    if (!targetLead?.phone || selectedChannel !== 'WhatsApp') {
      // Se não for WhatsApp ou não tiver telefone, salva como mensagem interna/email
      await saveChatMessage({
        leadId: selectedChatId,
        text: selectedChannel === 'WhatsApp' ? finalMsg : `[Via ${selectedChannel}] ${finalMsg}`,
        sentByMe: true,
        type: 'text',
        status: 'sent',
      });
      return;
    }

    // DB-first: save with status 'sending' → realtime will render it
    // then call Z-API and update the status
    const result = await sendWhatsApp(targetLead.phone, finalMsg, selectedChatId);
    if (!result?.success) {
      setSendError(result?.error || 'Falha ao enviar mensagem via WhatsApp.');
      // Message was already saved to DB with status 'failed' by sendWhatsApp
    }
  };

  const toggleSignature = () => {
    setUseSignature(!useSignature);
  };

  const insertEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
  };

  const useQuickMsg = (msg: string) => {
    setInputText(msg);
    setShowQuickMsgs(false);
  };

  const useTemplate = (tpl: MetaTemplate) => {
    // Basic placeholder replacement for demo
    const parsedText = tpl.text.replace('{{1}}', selectedChat?.name || 'Cliente');
    setInputText(parsedText);
    setShowTemplates(false);
  };

  const startRecording = async () => {
    if (!selectedChatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 64;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        if (!(mediaRecorderRef.current as any)?.hasCanceled) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          // TODO: Implement Z-API audio sending for DB persistence
          // For now, these are not saved to chat_messages table
        }
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setTimeout(() => drawWaveform(), 50);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      alert("Erro ao acessar o microfone.");
    }
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = Math.ceil((canvas.width / bufferLength) * 2.5);
      let barHeight;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * (canvas.height - 4) + 3;
        ctx.fillStyle = i < (bufferLength / 2) ? '#ef4444' : '#f87171';
        const y = (canvas.height - barHeight) / 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barWidth - 2, barHeight, 2);
        else ctx.rect(x, y, barWidth - 2, barHeight);
        ctx.fill();
        x += barWidth;
      }
    };
    draw();
  };

  const stopRecording = (cancel = false) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (mediaRecorderRef.current && isRecording) {
      if (cancel) (mediaRecorderRef.current as any).hasCanceled = true;
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingTime(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className={styles.container}>
      <ChatSidebar
        hiddenOnMobile={!!selectedChatId}
        canCreateContact={hasPermission('leads.create')}
        onNewContact={() => { setShowNewContact(true); setContactError(''); }}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        filteredChats={filteredChats}
        selectedChatId={selectedChatId}
        onSelectChat={setSelectedChatId}
      />

      {/* CHAT PANEL */}
      <div className={`${styles.mainChat} ${!selectedChatId ? styles.hiddenOnMobile : ''}`}>
        {selectedChatId && selectedChat ? (
          <>
            <ChatHeaderMain
              selectedChat={selectedChat}
              onBack={() => setSelectedChatId(null)}
              userName={user?.name}
              showNotifications={showNotifications}
              onToggleNotifications={() => setShowNotifications(!showNotifications)}
              onCloseNotifications={() => setShowNotifications(false)}
              unreadCount={unreadCount}
              onToggleInfo={() => setShowInfo(!showInfo)}
            />

            <MessageBubbleList
              activeMessages={activeMessages}
              selectedChatName={selectedChat.name}
              selectedChannel={selectedChannel}
              onSelectChannel={setSelectedChannel}
              messagesEndRef={messagesEndRef}
            />

            {/* SEND ERROR BANNER */}
            <AnimatePresence>
              {sendError && (
                <SendErrorBanner message={sendError} onDismiss={() => setSendError(null)} />
              )}
            </AnimatePresence>

            <MessageInputBar
              isRecording={isRecording}
              recordingTime={recordingTime}
              canvasRef={canvasRef}
              onCancelRecording={() => stopRecording(true)}
              onConfirmRecording={() => stopRecording(false)}
              inputText={inputText}
              onInputTextChange={setInputText}
              onKeyDown={handleKeyDown}
              showEmoji={showEmoji}
              onToggleEmoji={() => setShowEmoji(!showEmoji)}
              onInsertEmoji={insertEmoji}
              useSignature={useSignature}
              onToggleSignature={toggleSignature}
              canUseQuickMessages={hasPermission('messages.templates')}
              showQuickMsgs={showQuickMsgs}
              onToggleQuickMsgs={() => setShowQuickMsgs(!showQuickMsgs)}
              quickTemplates={quickTemplates}
              onUseQuickMsg={useQuickMsg}
              showTemplates={showTemplates}
              onToggleTemplates={() => setShowTemplates(!showTemplates)}
              onUseTemplate={useTemplate}
              onSendMessage={() => handleSendMessage()}
              onStartRecording={startRecording}
            />

            {/* INFO DRAWER */}
            <AnimatePresence>
              {showInfo && (
                <LeadInfoDrawer
                  selectedChat={selectedChat}
                  isEditing={isEditing}
                  onStartEdit={() => setIsEditing(true)}
                  onClose={() => { setShowInfo(false); setIsEditing(false); }}
                  editForm={editForm}
                  onEditFormChange={setEditForm}
                  currentStageName={currentStageName}
                  pipelineStages={pipelineStages}
                  selectedChannel={selectedChannel}
                  onSelectChannel={setSelectedChannel}
                  onSaveEdit={() => {
                    if (selectedChatId) {
                      updateLead(selectedChatId, {
                        name: editForm.name,
                        email: editForm.email,
                        phone: editForm.phone,
                        value: editForm.value,
                        pipelineStage: editForm.stage
                      });
                    }
                    setIsEditing(false);
                  }}
                  onCancelEdit={() => setIsEditing(false)}
                  onTransfer={() => alert('Abrindo lista de atendentes...')}
                />
              )}
            </AnimatePresence>
          </>
        ) : (
          <EmptyChatState
            userName={user?.name}
            showNotifications={showNotifications}
            onToggleNotifications={() => setShowNotifications(!showNotifications)}
            onCloseNotifications={() => setShowNotifications(false)}
            unreadCount={unreadCount}
          />
        )}
      </div>

      {/* MODAL NOVO CONTATO */}
      <AnimatePresence>
        {showNewContact && (
          <NewContactModal
            newContact={newContact}
            onChange={setNewContact}
            pipelineStages={pipelineStages}
            contactError={contactError}
            savingContact={savingContact}
            onClose={() => setShowNewContact(false)}
            onCreate={handleCreateContact}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '24px' }}>Carregando mensagens...</div>}>
      <MessagesContent />
    </Suspense>
  );
}
