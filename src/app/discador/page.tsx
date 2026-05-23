"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { 
  Phone, 
  Upload, 
  Play, 
  Pause, 
  Users, 
  BarChart3, 
  CheckCircle2, 
  XCircle, 
  Clock,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './discador.module.css';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface CallQueueItem {
  id: number;
  name: string;
  phone: string;
  status: 'pending' | 'calling' | 'completed' | 'failed';
}

export default function PowerDialerPage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<CallQueueItem[]>([]);
  const [isDialing, setIsDialing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [agents, setAgents] = useState<any[]>([]);

  // Fetch real agents from database
  useEffect(() => {
    async function fetchAgents() {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, status, role')
        .order('name');
      
      if (data) {
        // Map database status to UI status
        const mappedAgents = data.map(agent => ({
          id: agent.name, // Using name as ID for Twilio Client identity
          name: agent.name,
          status: agent.status === 'ACTIVE' ? 'available' : 'offline',
          role: agent.role
        }));
        setAgents(mappedAgents);
      }
    }
    fetchAgents();
  }, []);

  // Sync current user with agents list and ensure they are 'available'
  useEffect(() => {
    if (user?.name) {
      setAgents(prev => {
        const userExists = prev.find(a => a.name === user.name);
        if (userExists) {
          return prev.map(a => a.name === user.name ? { ...a, status: 'available', name: `${user.name} (Você)` } : a);
        }
        return [...prev, { id: user.name, name: `${user.name} (Você)`, status: 'available' }];
      });
    }
  }, [user]);

  const [logs, setLogs] = useState<{time: string, msg: string}[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    pending: 0
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newQueue: CallQueueItem[] = data.map((row, index) => ({
        id: index,
        name: row.Nome || row.name || 'Sem nome',
        phone: String(row.Telefone || row.phone || '').replace(/\D/g, ''),
        status: 'pending' as const
      })).filter(item => item.phone.length >= 8);

      setQueue(newQueue);
      setStats({
        total: newQueue.length,
        completed: 0,
        failed: 0,
        pending: newQueue.length
      });
    };
    reader.readAsBinaryString(file);
  };

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [{ time, msg }, ...prev].slice(0, 50));
  };

  const processNextCall = useCallback(async (index: number) => {
    if (!isDialing || index >= queue.length) {
      if (index >= queue.length) {
        setIsDialing(false);
        addLog("Campanha finalizada.");
      }
      return;
    }

    const contact = queue[index];
    if (!contact) return;

    setCurrentIndex(index);
    setQueue(prev => prev.map((item, i) => i === index ? { ...item, status: 'calling' } : item));
    
    // Find available agent
    const availableAgent = agents.find(a => a.status === 'available');
    
    if (!availableAgent) {
      addLog(`Falha: Nenhum agente disponível para ${contact.name}`);
      setQueue(prev => prev.map((item, i) => i === index ? { ...item, status: 'failed' } : item));
      setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
      setTimeout(() => processNextCall(index + 1), 2000);
      return;
    }

    addLog(`Ligando para ${contact.name}...`);

    try {
      const response = await fetch('/api/twilio/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contact.phone,
          userId: user?.id,
          agentId: availableAgent.id
        })
      });

      if (response.ok) {
        addLog(`Encaminhando ${contact.name} para ${availableAgent.name}`);
        setQueue(prev => prev.map((item, i) => i === index ? { ...item, status: 'completed' } : item));
        setStats(prev => ({ ...prev, completed: prev.completed + 1, pending: prev.pending - 1 }));
      } else {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`Server error: ${response.status}`);
      }
    } catch (error) {
      addLog(`Erro ao ligar para ${contact.name}`);
      setQueue(prev => prev.map((item, i) => i === index ? { ...item, status: 'failed' } : item));
      setStats(prev => ({ ...prev, failed: prev.failed + 1, pending: prev.pending - 1 }));
    }

    // Wait before next call
    setTimeout(() => processNextCall(index + 1), 3000);
  }, [isDialing, queue, agents, user]);

  useEffect(() => {
    if (isDialing && currentIndex === -1) {
      processNextCall(0);
    }
  }, [isDialing, currentIndex, processNextCall]);

  const startAutoDialer = () => {
    if (queue.length === 0) return;
    setIsDialing(true);
    setCurrentIndex(-1);
    addLog("Iniciando campanha automática...");
  };

  const stopAutoDialer = () => {
    setIsDialing(false);
    addLog("Discador pausado pelo usuário.");
  };

  return (
    <div className={styles.pageWrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Power Dialer</h1>
          <p className={styles.subtitle}>Gestão de chamadas automáticas e redirecionamento</p>
        </div>
        
        <div className={styles.actions}>
          <label className={styles.uploadBtn}>
            <Upload size={18} />
            <span>Subir Planilha</span>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} hidden />
          </label>
          
          {isDialing ? (
            <button className={styles.stopBtn} onClick={stopAutoDialer}>
              <Pause size={18} />
              <span>Parar Discador</span>
            </button>
          ) : (
            <button className={styles.startBtn} onClick={startAutoDialer} disabled={queue.length === 0}>
              <Play size={18} />
              <span>Iniciar Campanha</span>
            </button>
          )}
        </div>
      </header>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
            <FileSpreadsheet size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total na Fila</span>
            <span className={styles.statValue}>{stats.total}</span>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Atendidas</span>
            <span className={styles.statValue}>{stats.completed}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <XCircle size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Falhas</span>
            <span className={styles.statValue}>{stats.failed}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <UserCheck size={20} />
          </div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Agentes Online</span>
            <span className={styles.statValue}>4</span>
          </div>
        </div>
      </div>

      <div className={styles.mainContent}>
        {/* Queue Table */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>Fila de Chamadas</h3>
            <span className={styles.badge}>{queue.length} contatos</span>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyRow}>
                      Nenhuma planilha importada. Comece subindo um arquivo .xlsx
                    </td>
                  </tr>
                ) : (
                  queue.map((item, i) => (
                    <tr key={item.id} className={i === currentIndex ? styles.rowCalling : ''}>
                      <td>{item.name}</td>
                      <td>{item.phone}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[item.status]}`}>
                          {item.status === 'pending' && 'Pendente'}
                          {item.status === 'calling' && 'Chamando...'}
                          {item.status === 'completed' && 'Finalizada'}
                          {item.status === 'failed' && 'Falha'}
                        </span>
                      </td>
                      <td>
                        <button className={styles.rowBtn} title="Ligar agora">
                          <Phone size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Agents & Live Feed */}
        <div className={styles.sidePanel}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Agentes Disponíveis</h3>
            </div>
            <div className={styles.agentList}>
              {agents.map((agent, i) => (
                <div key={i} className={styles.agentItem}>
                  <div className={styles.agentAvatar}>{agent.name.charAt(0)}</div>
                  <div className={styles.agentInfo}>
                    <p>{agent.name}</p>
                    <span className={styles[agent.status]}>{agent.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card} style={{ marginTop: '1rem' }}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Monitor em Tempo Real</h3>
            </div>
            <div className={styles.liveLog}>
              {logs.map((log, i) => (
                <div key={i} className={styles.logItem}>
                  <Clock size={12} />
                  <span>[{log.time}] {log.msg}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className={styles.emptyLog}>Aguardando atividade...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
