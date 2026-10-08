'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import { showBrowserNotification } from '@/hooks/useBrowserNotifications';
import { playNotificationSound } from '@/lib/notificationSound';
import { getNotificationPrefs } from '@/lib/notificationPrefs';

/**
 * Toca som + mostra pop-up sempre que chega uma mensagem nova de
 * WhatsApp, Instagram ou Messenger (chat_messages, sent_by_me = false)
 * -- igual ao WhatsApp Web de verdade, independente de qual tela o
 * usuário está vendo.
 */
const CHANNEL_NAME: Record<string, string> = { instagram: 'Instagram', messenger: 'Messenger' };
export default function WhatsAppNotificationListener() {
  const { user } = useAuth();
  const { leads } = useLeads();
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    if (!user || (user.workspace && !user.workspace.modules.includes('crm'))) return;

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
            provider?: string | null;
          };

          if (message.sent_by_me) return;

          // Configurações > Notificações (vale por aparelho).
          const prefs = getNotificationPrefs();
          if (prefs.whatsappSound) playNotificationSound();
          if (!prefs.whatsappPopup) return;

          const channelName = CHANNEL_NAME[message.provider || ''] || 'WhatsApp';
          const preview =
            message.text?.trim() ||
            (message.type === 'audio' ? '🎵 Áudio' : message.type === 'image' ? '📷 Imagem' : message.type === 'document' ? '📎 Arquivo' : 'Nova mensagem');
          const show = () => {
            const lead = leadsRef.current.find((l) => l.id === message.lead_id);
            showBrowserNotification({
              id: message.id,
              title: lead ? `${lead.name} • ${channelName}` : `Novo contato no ${channelName}`,
              content: preview,
              link: `/messages?chatId=${message.lead_id}`,
            });
          };

          // Contato novo: a lista de leads chega em instantes (tempo real);
          // espera um pouco para o aviso já vir com o nome.
          if (leadsRef.current.some((l) => l.id === message.lead_id)) show();
          else setTimeout(show, 1500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}
