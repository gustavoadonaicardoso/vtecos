"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BookOpen, PhoneCall } from 'lucide-react';
import styles from './discador.module.css';
import { useAuth } from '@/context/AuthContext';
import { formatPhone } from '@/lib/dialer/phone';
import type { AgentState, DialerCampaign, TeamAgent } from '@/lib/dialer/types';
import AgentConsole from './components/AgentConsole';
import CampaignDetail from './components/CampaignDetail';
import CampaignList from './components/CampaignList';
import NewCampaignModal from './components/NewCampaignModal';
import TeamPanel from './components/TeamPanel';
import { useAgentPhone } from './components/useAgentPhone';
import { request } from './components/shared';

const HEARTBEAT_MS = 5000;
const agentPost = (body: Record<string, unknown>) => request<AgentState>('/api/dialer/agent', { method: 'POST', body: JSON.stringify(body) });

/**
 * Discador automático: o atendente fica disponível e recebe as ligações
 * atendidas; administradores e gerentes sobem planilhas e controlam as
 * campanhas. O servidor é quem liga (src/lib/dialer/engine.ts).
 */
export default function DiscadorPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [agent, setAgent] = useState<AgentState | null>(null);
  const [team, setTeam] = useState<TeamAgent[]>([]);
  const [campaigns, setCampaigns] = useState<DialerCampaign[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('campanha')));
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyCampaign, setBusyCampaign] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [callEnded, setCallEnded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const statusRef = useRef<string>('offline');

  const applyAgent = useCallback((result: { data?: AgentState; error?: string }) => {
    if (result.data) {
      setAgent(result.data);
      statusRef.current = result.data.status;
    }
    return result;
  }, []);
  const heartbeat = useCallback(() => agentPost({ action: 'heartbeat' }).then(applyAgent), [applyAgent]);

  const phone = useAgentPhone({
    onIncoming: () => { setCallEnded(false); void heartbeat(); },
    onEnded: () => { setCallEnded(true); void heartbeat(); setTimeout(() => void heartbeat(), 1500); },
  });

  // Ao abrir a tela o telefone do navegador ainda está desligado: não
  // fica "disponível" de uma visita anterior (finalização continua).
  useEffect(() => {
    request<AgentState>('/api/dialer/agent').then(async (result) => {
      if (result.error) setError(result.error);
      if (!result.data) return;
      if (result.data.status === 'available' || result.data.status === 'paused') applyAgent(await agentPost({ action: 'offline' }));
      else applyAgent(result);
    });
  }, [applyAgent]);

  // Sinal de vida + situação (a cada 5 s enquanto não estiver offline).
  useEffect(() => {
    const timer = setInterval(() => {
      if (statusRef.current !== 'offline') void heartbeat();
    }, HEARTBEAT_MS);
    const leave = () => {
      if (statusRef.current !== 'offline' && statusRef.current !== 'on_call') navigator.sendBeacon('/api/dialer/agent', JSON.stringify({ action: 'offline' }));
    };
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [heartbeat]);

  // Equipe e campanhas.
  const fetchTeam = useCallback(() => request<TeamAgent[]>('/api/dialer/team'), []);
  const fetchCampaigns = useCallback(() => request<DialerCampaign[]>('/api/dialer/campaigns'), []);
  const applyTeam = useCallback((result: { data?: TeamAgent[] }) => { if (result.data) setTeam(result.data); setNow(Date.now()); }, []);
  const applyCampaigns = useCallback((result: { data?: DialerCampaign[]; error?: string }) => { if (result.data) setCampaigns(result.data); }, []);
  const reloadCampaigns = useCallback(() => { void fetchCampaigns().then(applyCampaigns); }, [fetchCampaigns, applyCampaigns]);

  useEffect(() => {
    fetchTeam().then(applyTeam);
    if (isManager) fetchCampaigns().then(applyCampaigns);
    const timer = setInterval(() => {
      fetchTeam().then(applyTeam);
      if (isManager) fetchCampaigns().then(applyCampaigns);
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [isManager, fetchTeam, fetchCampaigns, applyTeam, applyCampaigns]);

  const goAvailable = async () => {
    setBusy(true);
    setError('');
    setCallEnded(false);
    const ready = await phone.start();
    if (!ready) {
      setBusy(false);
      return;
    }
    const result = applyAgent(await agentPost({ action: 'available' }));
    setBusy(false);
    if (result.error) {
      setError(result.error);
      phone.stop();
    }
  };

  const pause = async () => {
    setBusy(true);
    const result = applyAgent(await agentPost({ action: 'pause' }));
    setBusy(false);
    if (result.error) setError(result.error);
  };

  const leave = async () => {
    setBusy(true);
    const result = applyAgent(await agentPost({ action: 'offline' }));
    setBusy(false);
    if (result.error) setError(result.error);
    else phone.stop();
  };

  const wrapup = async (outcome: string | null, notes: string, next: 'available' | 'pause') => {
    setBusy(true);
    setError('');
    let target = next;
    if (next === 'available' && phone.state !== 'ready' && !(await phone.start())) target = 'pause';
    const result = applyAgent(await agentPost({ action: 'wrapup', outcome, notes, next: target }));
    setBusy(false);
    setCallEnded(false);
    if (result.error) setError(result.error);
  };

  const campaignAction = async (id: string, action: 'start' | 'pause') => {
    setBusyCampaign(id);
    setError('');
    const result = await request(`/api/dialer/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
    setBusyCampaign(null);
    if (result.error) setError(result.error);
    reloadCampaigns();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Discador</h1>
          <p>O sistema liga para a lista e passa para você só quem atendeu.</p>
        </div>
        {agent?.phoneNumber && <span className={styles.numberChip}><PhoneCall size={15} /> Ligando de {formatPhone(agent.phoneNumber)}</span>}
      </header>

      {agent && !agent.connected && (
        <div className={styles.banner}>
          <AlertTriangle size={16} />
          <span>
            O Discador ainda não está conectado.{' '}
            {user?.role === 'ADMIN'
              ? <>Conecte a conta Twilio da empresa em <Link href="/integrations">Integrações &gt; Discador</Link>.</>
              : 'Peça a um administrador para conectar a conta Twilio da empresa em Integrações.'}
          </span>
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.side}>
          <AgentConsole
            state={agent}
            phone={phone}
            busy={busy}
            error={error}
            callEnded={callEnded}
            onGoAvailable={goAvailable}
            onPause={pause}
            onLeave={leave}
            onWrapup={wrapup}
          />
          {isManager && (openId
            ? <CampaignDetail key={openId} id={openId} onBack={() => { setOpenId(null); window.history.replaceState(null, '', '/discador'); }} onChanged={reloadCampaigns} />
            : <CampaignList campaigns={campaigns} busyId={busyCampaign} onNew={() => setCreating(true)} onOpen={setOpenId} onAction={campaignAction} />)}
        </div>
        <div className={styles.side}>
          <TeamPanel agents={team} now={now} />
          <section className={styles.card}>
            <div className={styles.cardHead}><h2><BookOpen size={18} /> Como funciona</h2></div>
            <ol className={styles.hint} style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>{isManager ? 'Suba a planilha em Nova campanha e clique em Começar.' : 'Um gerente sobe a planilha e começa a campanha.'}</li>
              <li>Coloque o fone e clique em <strong>Ficar disponível</strong>.</li>
              <li>O sistema liga sozinho; caixa postal e quem não atende ficam de fora.</li>
              <li>Quem atender entra direto no seu fone, com os dados da planilha na tela.</li>
              <li>Ao desligar, marque o resultado e siga para a próxima.</li>
            </ol>
            <Link href="/help/discador" className={styles.secondaryBtn}>Ver o tutorial completo</Link>
          </section>
        </div>
      </div>

      {creating && (
        <NewCampaignModal
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); reloadCampaigns(); setOpenId(id); }}
        />
      )}
    </div>
  );
}
