'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import { showBrowserNotification } from '@/hooks/useBrowserNotifications';
import { playNotificationSound } from '@/lib/notificationSound';

/**
 * Toca som + mostra pop-up sempre que chega uma mensagem nova de
 * WhatsApp (chat_messages, sent_by_me = false) -- igual ao WhatsApp
 * Web de verdade, independente de qual tela o usuário está vendo.
 */
export default function WhatsAppNotificationListener() {
  const { user } = useAuth();
  const { leads } = useLeads();
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    if (!user || user.account_type === 'CLIENT') return;

    const channel = supabase
      .channel('whatsapp_new_message_alert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const message = payload.new as {
            id: string;
            lead_id: string;
            text: string | null;
            sent_by_me: boolean;
            type: string;
          };

          if (message.sent_by_me) return;

          playNotificationSound();

          const lead = leadsRef.current.find((l) => l.id === message.lead_id);
          const preview =
            message.text?.trim() ||
            (message.type === 'audio' ? '🎵 Áudio' : message.type === 'image' ? '📷 Imagem' : message.type === 'document' ? '📎 Arquivo' : 'Nova mensagem');

          showBrowserNotification({
            id: message.id,
            title: lead ? `${lead.name} • WhatsApp` : 'Nova mensagem no WhatsApp',
            content: preview,
            link: `/messages?chatId=${message.lead_id}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
