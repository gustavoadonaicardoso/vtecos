"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, MessageSquare, X } from 'lucide-react';
import styles from './messages.module.css';
import { useLeads } from '@/context/LeadContext';
import { useAuth } from '@/context/AuthContext';
import { usePermissions } from '@/lib/permissions';
import { useSidebar } from '@/components/SidebarProvider';
import { supabase } from '@/lib/supabase';
import { fetchUnreadNotificationsCount } from '@/services/notifications.service';
import { useTeam } from '@/components/leads/useTeam';
import LeadPanel from '@/app/leads/components/LeadPanel';
import type { Lead } from '@/types';
import type { ChatMessage, InboxTab, QuickReply } from './types';
import { fillTemplate, mapMessage } from './format';
import ConversationList from './components/ConversationList';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import Composer from './components/Composer';
import TransferModal from './components/TransferModal';
import QuickRepliesModal from './components/QuickRepliesModal';
import SystemToolsBar from './components/SystemToolsBar';

const HISTORY_LIMIT = 300;

function MessagesContent() {
  const { leads, loaded, pipelineStages, tags, updateLead, deleteLead, openModal, lastCreatedLeadId } = useLeads();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { toggleMobileMenu } = useSidebar();
  const canAssign = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const team = useTeam(Boolean(user));
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = useSearchParams().get('chatId');

  const [tab, setTab] = useState<InboxTab>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [channels, setChannels] = useState<{ web: boolean; api: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [aiPause, setAiPause] = useState<Record<string, string | null>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const seenCreated = useRef(lastCreatedLeadId);

  const selectChat = useCallback((id: string | null) => {
    setShowInfo(false);
    router.replace(id ? `${pathname}?chatId=${id}` : pathname, { scroll: false });
  }, [pathname, router]);

  const ownerName = useCallback((id?: string | null) => (id ? team.find((member) => member.id === id)?.name || 'Membro inativo' : null), [team]);
  const lead = leads.find((item) => item.id === selectedId) || null;

  // ── Lista ──
  const counts = useMemo(() => ({
    all: leads.length,
    unread: leads.filter((item) => (item.unreadCount ?? 0) > 0).length,
    mine: leads.filter((item) => item.assignedTo === user?.id).length,
    unassigned: leads.filter((item) => !item.assignedTo).length,
  }), [leads, user?.id]);

  const conversations = useMemo(() => {
    const text = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    const time = (item: Lead) => new Date(item.lastActivityAt || item.createdAt || 0).getTime();
    return leads
      .filter((item) => {
        if (item.id === selectedId) return true;
        if (tab === 'unread' && !(item.unreadCount ?? 0)) return false;
        if (tab === 'mine' && item.assignedTo !== user?.id) return false;
        if (tab === 'unassigned' && item.assignedTo) return false;
        if (!text) return true;
        return item.name.toLowerCase().includes(text) || (digits.length >= 3 && item.phone.replace(/\D/g, '').includes(digits));
      })
      .sort((a, b) => time(b) - time(a));
  }, [leads, query, tab, selectedId, user?.id]);

  // ── Dados auxiliares ──
  const loadQuickReplies = useCallback(async () => {
    const response = await fetch('/api/messages/templates', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (response.ok) setQuickReplies(json.templates || []);
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      loadQuickReplies();
      fetch('/api/messages/channel', { cache: 'no-store' }).then((r) => r.json()).then((json) => setChannels(json.data || null)).catch(() => {});
    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    const fetchCount = () => fetchUnreadNotificationsCount(user.id).then((count) => setUnreadNotifications(count ?? 0));
    fetchCount();
    const poll = window.setInterval(fetchCount, 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [user, loadQuickReplies]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Lead cadastrado pelo "Novo": abre a conversa dele.
  useEffect(() => {
    if (lastCreatedLeadId && lastCreatedLeadId !== seenCreated.current) {
      seenCreated.current = lastCreatedLeadId;
      router.replace(`${pathname}?chatId=${lastCreatedLeadId}`, { scroll: false });
    }
  }, [lastCreatedLeadId, pathname, router]);

  // ── Conversa aberta: histórico + tempo real ──
  useEffect(() => {
    if (!selectedId || !supabase) return;
    const client = supabase;
    let alive = true;

    const load = async () => {
      setMessages(null);
      const { data } = await client
        .from('chat_messages')
        .select('*')
        .eq('lead_id', selectedId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);
      if (alive) setMessages((data || []).map((row) => mapMessage(row as Record<string, unknown>)).reverse());
    };
    const markRead = () => fetch('/api/messages/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: selectedId }) }).catch(() => {});

    const timer = window.setTimeout(() => {
      load();
      markRead();
    }, 0);

    const channel = client
      .channel(`chat-${selectedId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `lead_id=eq.${selectedId}` }, (payload) => {
        const message = mapMessage(payload.new as Record<string, unknown>);
        setMessages((prev) => (prev && !prev.some((item) => item.id === message.id) ? [...prev, message] : prev));
        if (!message.sent) markRead();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `lead_id=eq.${selectedId}` }, (payload) => {
        const message = mapMessage(payload.new as Record<string, unknown>);
        setMessages((prev) => prev?.map((item) => (item.id === message.id ? message : item)) ?? prev);
      })
      .subscribe();

    return () => {
      alive = false;
      window.clearTimeout(timer);
      client.removeChannel(channel);
    };
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, selectedId]);

  // ── Envio ──
  const upsertMessage = (row: Record<string, unknown> | null | undefined) => {
    if (!row?.id) return;
    const message = mapMessage(row);
    setMessages((prev) => {
      if (!prev) return prev;
      return prev.some((item) => item.id === message.id) ? prev.map((item) => (item.id === message.id ? { ...item, ...message } : item)) : [...prev, message];
    });
  };

  const sendText = async (text: string) => {
    if (!lead) return false;
    setSending(true);
    const response = await fetch('/api/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, text }) });
    const json = await response.json().catch(() => ({}));
    setSending(false);
    upsertMessage(json.data);
    if (!response.ok) {
      setNotice({ type: 'error', text: json.error || 'Não foi possível enviar.' });
      return Boolean(json.data);
    }
    return true;
  };

  const retry = async (message: ChatMessage) => {
    if (!lead) return;
    setRetrying(message.id);
    const response = await fetch('/api/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: lead.id, retryId: message.id }) });
    const json = await response.json().catch(() => ({}));
    setRetrying(null);
    upsertMessage(json.data);
    if (!response.ok) setNotice({ type: 'error', text: json.error || 'Não foi possível reenviar.' });
  };

  const sendFile = async (file: File, caption?: string) => {
    if (!lead) return;
    const form = new FormData();
    form.append('file', file);
    form.append('leadId', lead.id);
    if (caption) form.append('caption', caption);
    const response = await fetch('/api/messages/media', { method: 'POST', body: form });
    const json = await response.json().catch(() => ({}));
    upsertMessage(json.data);
    if (!response.ok) setNotice({ type: 'error', text: json.error || 'Não foi possível enviar o arquivo.' });
  };

  const transfer = async (memberId: string, note: string) => {
    if (!lead) return null;
    const response = await fetch(`/api/leads/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedTo: memberId, note }) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return json.error || 'Não foi possível transferir.';
    setShowTransfer(false);
    setNotice({ type: 'ok', text: `Conversa transferida para ${ownerName(memberId)}.` });
    // Vendedor deixa de ver o lead que passou adiante.
    if (!canAssign) selectChat(null);
    return null;
  };

  const aiPausedUntil = lead ? (lead.id in aiPause ? aiPause[lead.id] : lead.aiPausedUntil ?? null) : null;
  const aiPaused = Boolean(aiPausedUntil && new Date(aiPausedUntil).getTime() > now);

  const toggleAi = async () => {
    if (!lead || aiBusy) return;
    setAiBusy(true);
    const response = await fetch(`/api/leads/${lead.id}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: !aiPaused }) }).catch(() => null);
    const json = response ? await response.json().catch(() => ({})) : {};
    setAiBusy(false);
    if (!response?.ok) {
      setNotice({ type: 'error', text: json.error || 'Não foi possível mudar a IA desta conversa.' });
      return;
    }
    setAiPause((current) => ({ ...current, [lead.id]: json.data?.aiPausedUntil ?? null }));
    setNow(Date.now());
    setNotice({ type: 'ok', text: aiPaused ? 'A IA voltou a responder esta conversa.' : 'IA pausada nesta conversa: só a equipe responde até você retomar.' });
  };

  const channelLabel = channels ? (channels.web ? 'WhatsApp Web' : channels.api ? 'API oficial' : null) : null;
  const disabledReason = !lead
    ? null
    : !lead.phone
      ? 'Este contato não tem telefone. Abra os dados do lead (ícone ⓘ) e cadastre o WhatsApp para conversar.'
      : channels && !channels.web && !channels.api
        ? 'Nenhum WhatsApp conectado. Conecte o WhatsApp Web ou a API oficial em Integrações para responder por aqui.'
        : null;

  const tools = {
    userName: user?.name,
    showNotifications,
    onToggleNotifications: () => setShowNotifications((value) => !value),
    onCloseNotifications: () => setShowNotifications(false),
    unreadCount: unreadNotifications,
  };

  return (
    <div className={styles.container}>
      <ConversationList
        hidden={Boolean(selectedId)}
        conversations={conversations}
        counts={counts}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        selectedId={selectedId}
        onSelect={(id) => selectChat(id)}
        canAssign={canAssign}
        ownerName={ownerName}
        canCreate={hasPermission('leads.create')}
        onNewContact={() => openModal()}
        now={now}
        loaded={loaded}
        onMenu={toggleMobileMenu}
      />

      <section className={`${styles.chat} ${selectedId ? '' : styles.hideMobile}`} aria-label="Conversa">
        {lead ? (
          <>
            <ChatHeader
              lead={lead}
              ownerName={ownerName(lead.assignedTo)}
              canTransfer={canAssign || lead.assignedTo === user?.id}
              channelLabel={channelLabel}
              onBack={() => selectChat(null)}
              onTransfer={() => setShowTransfer(true)}
              onInfo={() => setShowInfo(true)}
              aiPaused={aiPaused}
              aiBusy={aiBusy}
              onToggleAi={toggleAi}
              tools={tools}
            />
            {channels && !channels.web && !channels.api && (
              <div className={styles.banner}>
                <AlertTriangle size={15} /> Nenhum WhatsApp conectado: as mensagens não saem. <Link href="/integrations">Conectar em Integrações</Link>
              </div>
            )}
            {lead.status === 'Bloqueado' && <div className={styles.banner}><AlertTriangle size={15} /> Contato bloqueado: as automações não rodam para ele. Você ainda pode responder.</div>}
            <MessageList messages={messages} leadName={lead.name} now={now} retrying={retrying} onRetry={retry} endRef={endRef} />
            <Composer
              disabledReason={disabledReason}
              canUseQuickReplies={hasPermission('messages.templates')}
              canManageQuickReplies={canAssign}
              quickReplies={quickReplies}
              fill={(text) => fillTemplate(text, { name: lead.name, agent: user?.name?.split(' ')[0] || '' })}
              agentName={user?.name?.split(' ')[0] || ''}
              sending={sending}
              onSend={sendText}
              onSendFile={sendFile}
              onManageQuickReplies={() => setShowQuick(true)}
            />
          </>
        ) : (
          <div className={styles.empty}>
            <div className={styles.emptyTools}><SystemToolsBar {...tools} /></div>
            <MessageSquare size={48} />
            <h2>{selectedId && loaded ? 'Conversa não encontrada' : 'Escolha uma conversa'}</h2>
            <p>
              {selectedId && loaded
                ? 'Esse contato não existe mais ou está com outra pessoa da equipe.'
                : 'As mensagens do WhatsApp da empresa chegam aqui. As não lidas ficam em destaque e as mais recentes no topo.'}
            </p>
            {channels && !channels.web && !channels.api && <Link href="/integrations" className={styles.primaryBtn}>Conectar o WhatsApp</Link>}
          </div>
        )}
      </section>

      {showInfo && lead && (
        <LeadPanel
          key={lead.id}
          lead={lead}
          stages={pipelineStages}
          team={team}
          tagOptions={tags}
          canAssign={canAssign}
          hideConversation
          onSave={async (changes) => {
            const result = await updateLead(lead.id, changes);
            if (!result.ok) return result.error;
            setNotice({ type: 'ok', text: 'Lead salvo.' });
            return null;
          }}
          onDelete={async () => {
            const result = await deleteLead(lead.id);
            if (!result.ok) return result.error;
            selectChat(null);
            return null;
          }}
          onClose={() => setShowInfo(false)}
        />
      )}

      {showTransfer && lead && user && (
        <TransferModal leadName={lead.name} currentOwner={lead.assignedTo || null} team={team} selfId={user.id} onClose={() => setShowTransfer(false)} onTransfer={transfer} />
      )}

      {showQuick && <QuickRepliesModal replies={quickReplies} onChanged={loadQuickReplies} onClose={() => setShowQuick(false)} />}

      {notice && (
        <div className={`${styles.toast} ${notice.type === 'error' ? styles.toastError : ''}`} role="status">
          {notice.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {notice.text}
          <button type="button" className={styles.toastClose} onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesContent />
    </Suspense>
  );
}
