'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './queue.module.css';
import { logAudit } from '@/lib/audit';
import { useAuth } from '@/context/AuthContext';
import { sendWhatsApp } from '@/lib/zapi';
import { 
  Monitor, 
  UserPlus, 
  Clock, 
  ArrowRight, 
  RotateCcw, 
  Ticket,
  Users,
  Hash,
  ExternalLink,
  Trash2,
  Bell,
  HelpCircle
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationDropdown from '@/components/NotificationDropdown';
import Link from 'next/link';

interface Ticket {
  id: string;
  number: number;
  name?: string;
  whatsapp?: string;
  document?: string;
  desk: string;
  status: 'waiting' | 'calling' | 'completed';
  created_at: string;
}

export default function QueuePage() {
  const { user } = useAuth();
  const [desk, setDesk] = useState('01');
  const [totalDesks, setTotalDesks] = useState(5);
  const [waitingTickets, setWaitingTickets] = useState<Ticket[]>([]);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [lastTicketIssued, setLastTicketIssued] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Manual entry states
  const [manualName, setManualName] = useState('');
  const [manualWhatsapp, setManualWhatsapp] = useState('');
  const [manualDocument, setManualDocument] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchSettings = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('queue_settings').select('*').eq('id', 'default').single();
    if (data) setTotalDesks(data.total_desks);
  };

  useEffect(() => {
    fetchQueue();
    fetchSettings();
    const channel = supabase
      ?.channel('queue_staff')
      .on(
        'postgres_changes',
        { event: '*', table: 'queue_tickets', schema: 'public' },
        () => fetchQueue()
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel!);
    };
  }, []);

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
      .channel('queue_system_notifications')
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

  const fetchQueue = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('queue_tickets')
      .select('*')
      .order('created_at', { ascending: true });

    if (data) {
      setWaitingTickets(data.filter((t: Ticket) => t.status === 'waiting'));
      
      // Find the one currently being "called" by this desk
      const calling = data.find((t: Ticket) => t.status === 'calling' && t.desk === desk);
      setCurrentTicket(calling || null);

      // Find highest ticket number issued
      const maxNum = data.length > 0 ? Math.max(...data.map((t: Ticket) => t.number)) : 0;
      setLastTicketIssued(maxNum);
    }
    setIsLoading(false);
  };

  const generateTicket = async () => {
    const nextNumber = lastTicketIssued + 1;
    const ticketData = { 
      number: nextNumber, 
      name: manualName || 'Cliente (Manual)', 
      whatsapp: manualWhatsapp,
      document: manualDocument,
      status: 'waiting' 
    };

    let { error: insertError } = await (supabase?.from('queue_tickets').insert([ticketData]) || { error: { message: 'Supabase não inicializado' } });

    // Fallback if columns are missing
    if (insertError && (insertError as any).code === 'PGRST204') {
      console.warn('Fallback: Colunas whatsapp/document ausentes no DB.');
      const fallbackData = { 
        number: nextNumber, 
        name: manualName || 'Cliente (Manual)', 
        status: 'waiting' 
      };
      const { error: fallbackError } = await (supabase?.from('queue_tickets').insert([fallbackData]) || { error: { message: 'Supabase não inicializado' } });
      insertError = fallbackError;
    }

    if (insertError) {
      console.error('Insert error:', insertError);
      alert(`Erro ao gerar senha: ${insertError?.message || 'Verifique o banco de dados'}`);
    } else {
      // Audit Log
      logAudit(
        user,
        'TICKET_CREATE',
        `Senha #${nextNumber} gerada manualmente no Painel para ${manualName || 'Cliente'}.`,
        'ticket',
        nextNumber.toString()
      );

      // Create lead automatically (fail-safe)
      try {
        const { data: stageData } = await (supabase?.from('pipeline_stages').select('id').order('position').limit(1) || { data: null });
        const stageId = stageData?.[0]?.id || 'novo';

        await supabase?.from('leads').insert([{
          name: manualName || 'Cliente (Manual)',
          phone: manualWhatsapp,
          cpf_cnpj: manualDocument,
          source: 'Painel Central',
          stage_id: stageId,
          tags: ['Manual', 'Fila']
        }]);
      } catch (leadErr) {
        console.error('Error creating lead:', leadErr);
      }

      setManualName('');
      
      // WhatsApp Automation
      if (manualWhatsapp) {
        sendWhatsApp(manualWhatsapp, `✅ *Painel Estação Vórtice* ✅\n\nSua senha manual foi gerada!\n\nTicket: *#${nextNumber.toString().padStart(2, '0')}*\nAtendimento: *Gerencial*\n\nAguarde o chamado no telão.`);
      }

      setManualWhatsapp('');
      setManualDocument('');
    }
    fetchQueue();
  };

  const callNext = async () => {
    if (waitingTickets.length === 0) {
      alert('Não há senhas aguardando');
      return;
    }

    const nextOne = waitingTickets[0];
    
    // Mark previous current ticket (if any) as completed
    if (currentTicket) {
      await supabase?.from('queue_tickets')
        .update({ status: 'completed' })
        .eq('id', currentTicket.id);
      
      logAudit(
        user,
        'TICKET_COMPLETE',
        `Atendimento da senha #${currentTicket.number} finalizado no Guichê ${desk}.`,
        'ticket',
        currentTicket.id
      );
    }

    // Call the next one
    const { error } = await supabase?.from('queue_tickets')
      .update({ status: 'calling', desk: desk })
      .eq('id', nextOne.id) || { error: 'Supabase client missing' };

    if (!error) {
      logAudit(
        user,
        'TICKET_CALL',
        `Senha #${nextOne.number} chamada para o Guichê ${desk}.`,
        'ticket',
        nextOne.id
      );
    } else {
      alert('Erro ao chamar próxima');
    }
    fetchQueue();
  };

  const recallCurrent = async () => {
    if (!currentTicket) return;
    
    const { error } = await supabase?.from('queue_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentTicket.id) || { error: 'Supabase client missing' };

    if (!error) {
      logAudit(
        user,
        'TICKET_CALL',
        `Senha #${currentTicket.number} rechamada para o Guichê ${desk}.`,
        'ticket',
        currentTicket.id
      );
    } else {
      alert('Erro ao chamar novamente');
    }
  };

  const resetQueue = async () => {
    if (!confirm('ATENÇÃO: Isso irá apagar TODAS as senhas da fila hoje. Deseja continuar?')) {
      return;
    }

    const { error } = await supabase?.from('queue_tickets').delete().gt('number', 0) || { error: 'Supabase client missing' };

    if (!error) {
      logAudit(user, 'SETTINGS_UPDATE', 'Fila de senhas reiniciada completamente por ação administrativa.');
      setWaitingTickets([]);
      setCurrentTicket(null);
      setLastTicketIssued(0);
      alert('Fila reiniciada com sucesso!');
    } else {
      console.error('Reset error:', (error as any).message || error);
      alert(`Erro ao reiniciar fila: ${(error as any).message || 'Verifique as permissões do banco de dados'}`);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <Monitor size={28} color="var(--accent)" />
          <h1>Painel de Chamada</h1>
        </div>
        
        <div className={styles.headerActions}>

           <button onClick={() => window.open('/display', '_blank')} className={styles.linkBtn}>
            <ExternalLink size={18} /> Ver Display
           </button>
           <button onClick={() => window.open('/totem', '_blank')} className={styles.linkBtn}>
            <ExternalLink size={18} /> Ver Totem
           </button>
           <button onClick={resetQueue} className={styles.resetBtn}>
            <Trash2 size={18} /> Reiniciar Fila
           </button>
        </div>

        <div className={styles.deskSelector}>
          <label>Guichê Ativo</label>
          <select value={desk} onChange={(e) => setDesk(e.target.value)}>
            {Array.from({ length: totalDesks }, (_, i) => {
              const num = (i + 1).toString().padStart(2, '0');
              return <option key={num} value={num}>{num}</option>;
            })}
          </select>
        </div>
      </header>
      
      <div className={styles.grid}>
        {/* Atendimento Atual */}
        <section className={styles.currentSection}>
          <h2><Clock size={18} /> Atendimento Atual</h2>
          {currentTicket ? (
            <div className={styles.ticketCardLarge}>
              <div className={styles.ticketNumber}>
                <Hash size={32} style={{ opacity: 0.5 }} />
                {currentTicket.number.toString().padStart(2, '0')}
              </div>
              <div className={styles.ticketName}>{currentTicket.name || 'Sem nome'}</div>
              <div className={styles.actions}>
                <button onClick={recallCurrent} className={styles.recallBtn}>
                  <RotateCcw size={18} /> Chamar Novamente
                </button>
                <button onClick={callNext} className={styles.nextBtn}>
                  Chamar Próximo <ArrowRight size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>Nenhum chamado ativo no seu guichê.</p>
              <button onClick={callNext} className={styles.nextBtn}>
                Chamar Próximo <ArrowRight size={18} />
              </button>
            </div>
          )}
        </section>

        {/* Formulário de Senha Manual */}
        <section className={styles.manualSection}>
          <h2><UserPlus size={18} /> Gerar Senha Manual</h2>
          <div className={styles.manualForm}>
            <input 
              type="text" 
              placeholder="Nome do Cliente" 
              value={manualName} 
              onChange={(e) => setManualName(e.target.value)} 
            />
            <input 
              type="text" 
              placeholder="WhatsApp" 
              value={manualWhatsapp} 
              onChange={(e) => setManualWhatsapp(e.target.value)} 
            />
            <input 
              type="text" 
              placeholder="Documento" 
              value={manualDocument} 
              onChange={(e) => setManualDocument(e.target.value)} 
            />
            <button onClick={generateTicket} className={styles.generateBtn}>
              <Ticket size={18} /> Gerar Ticket #{lastTicketIssued + 1}
            </button>
          </div>
        </section>

        {/* Fila de Espera */}
        <section className={styles.queueSection}>
          <h2><Users size={18} /> Aguardando ({waitingTickets.length})</h2>
          <div className={styles.ticketList}>
            {waitingTickets.map((ticket) => (
              <div key={ticket.id} className={styles.ticketItem}>
                <span className={styles.itemNumber}>#{ticket.number.toString().padStart(2, '0')}</span>
                <span className={styles.itemName}>{ticket.name || 'Visitante'}</span>
                <span className={styles.itemTime}>{new Date(ticket.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
