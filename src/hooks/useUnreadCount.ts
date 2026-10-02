/**
 * ============================================================
 * VÓRTICE CRM — useUnreadCount hook
 * ============================================================
 * Gerencia a contagem de mensagens internas não lidas com
 * subscrição Realtime. Extraído do Sidebar para ser reutilizável.
 * ============================================================
 */

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchUnreadInternalChats } from '@/services/auth.service';
import { useAuth } from '@/context/AuthContext';

export function useUnreadCount() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    // Busca inicial
    fetchUnreadInternalChats(user.id).then(setUnreadCount);

    // Nome único por instância do hook: o Supabase devolve o MESMO canal
    // para nomes iguais, e o segundo componente (ex.: Sidebar + Dashboard)
    // quebrava ao adicionar callbacks num canal já inscrito.
    const instance = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`unread_internal_chat_${user.id}_${instance}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internal_chat' },
        () => fetchUnreadInternalChats(user.id).then(setUnreadCount)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return unreadCount;
}
