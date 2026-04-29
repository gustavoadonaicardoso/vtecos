"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Search, 
  Filter, 
  User, 
  Clock, 
  Settings, 
  Database,
  Shield,
  LogIn,
  LogOut,
  PlusCircle,
  Edit,
  Trash2,
  ChevronDown
} from 'lucide-react';
import styles from './logs.module.css';
import { supabase } from '@/lib/supabase';

interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

const ACTION_ICONS: Record<string, any> = {
  'LOGIN': LogIn,
  'LOGOUT': LogOut,
  'LEAD_CREATE': PlusCircle,
  'LEAD_UPDATE': Edit,
  'LEAD_DELETE': Trash2,
  'TICKET_CREATE': Database,
  'TICKET_CALL': Activity,
  'TICKET_COMPLETE': Shield,
  'SETTINGS_UPDATE': Settings,
};

const ACTION_COLORS: Record<string, string> = {
  'LOGIN': '#10b981',
  'LOGOUT': '#ef4444',
  'LEAD_CREATE': '#3b82f6',
  'LEAD_UPDATE': '#f59e0b',
  'LEAD_DELETE': '#ef4444',
  'TICKET_CREATE': '#8b5cf6',
  'TICKET_CALL': '#06b6d4',
  'TICKET_COMPLETE': '#10b981',
  'SETTINGS_UPDATE': '#6366f1',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');

  useEffect(() => {
    fetchLogs();
    
    // Subscribe to realtime logs
    if (!supabase) return;
    const channel = supabase
      .channel('audit_logs_realtime')
      .on('postgres_changes', { event: 'INSERT', table: 'audit_logs', schema: 'public' }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, []);

  const fetchLogs = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = filterAction === 'ALL' || log.action === filterAction;
    return matchesSearch && matchesAction;
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.iconBox}>
            <Activity size={24} />
          </div>
          <div>
            <h1>Audit Logs</h1>
            <p>Rastreabilidade total de ações na estação Vórtice.</p>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar por usuário ou ação..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className={styles.filterBox}>
            <Filter size={18} />
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
              <option value="ALL">Todas as Ações</option>
              <option value="LOGIN">Logins</option>
              <option value="LOGOUT">Logouts</option>
              <option value="LEAD_CREATE">Criação de Leads</option>
              <option value="TICKET_CREATE">Senhas Geradas</option>
              <option value="TICKET_CALL">Chamadas de Senha</option>
            </select>
          </div>
        </div>
      </header>

      <div className={styles.logsList}>
        <AnimatePresence mode="popLayout">
          {filteredLogs.map((log) => {
            const Icon = ACTION_ICONS[log.action] || Activity;
            const color = ACTION_COLORS[log.action] || '#94a3b8';
            
            return (
              <motion.div 
                key={log.id} 
                className={styles.logCard}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
              >
                <div className={styles.logIcon} style={{ background: `${color}15`, color: color }}>
                  <Icon size={20} />
                </div>
                
                <div className={styles.logContent}>
                   <div className={styles.logHeader}>
                      <span className={styles.userName}>
                        <User size={14} /> {log.user_name}
                      </span>
                      <span className={styles.logDate}>
                        <Clock size={14} /> {new Date(log.created_at).toLocaleString('pt-BR')}
                      </span>
                   </div>
                   <div className={styles.logAction} style={{ color: color }}>
                     {log.action.replace('_', ' ')}
                   </div>
                   <p className={styles.logDetails}>{log.details}</p>
                </div>

                {log.entity_type && (
                  <div className={styles.entityTag}>
                    {log.entity_type}: {log.entity_id}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredLogs.length === 0 && !loading && (
          <div className={styles.emptyState}>
            <Activity size={48} />
            <h3>Nenhum log encontrado</h3>
            <p>Ajuste os filtros ou realize ações no sistema para ver os logs aqui.</p>
          </div>
        )}

        {loading && (
          <div className={styles.loader}>
            <div className={styles.spinner}></div>
            Carregando trilha de auditoria...
          </div>
        )}
      </div>
    </div>
  );
}
