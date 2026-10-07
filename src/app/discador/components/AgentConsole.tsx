'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Coffee, Headphones, Loader2, LogOut, Mic, MicOff, Phone, PhoneOff, PhoneIncoming, Power } from 'lucide-react';
import styles from '../discador.module.css';
import { formatPhone } from '@/lib/dialer/phone';
import { OUTCOMES, type AgentState } from '@/lib/dialer/types';
import { clock } from './shared';
import type { PhoneState } from './useAgentPhone';

interface Props {
  state: AgentState | null;
  phone: { state: PhoneState; error: string; inCall: boolean; muted: boolean; hangUp: () => void; toggleMute: () => void };
  busy: boolean;
  error: string;
  /** O navegador viu a ligação terminar (o servidor confirma logo depois). */
  callEnded: boolean;
  onGoAvailable: () => void;
  onPause: () => void;
  onLeave: () => void;
  onWrapup: (outcome: string | null, notes: string, next: 'available' | 'pause') => void;
}

/** Cronômetro desde um horário (atualiza a cada segundo). */
function useElapsed(since: string | null | undefined, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000)) : 0;
}

function WrapupForm({ onDone, busy }: { onDone: Props['onWrapup']; busy: boolean }) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  return (
    <div className={styles.field}>
      <span>Como foi a ligação?</span>
      <div className={styles.chips}>
        {OUTCOMES.map((item) => (
          <button key={item.key} type="button" className={`${styles.chip} ${outcome === item.key ? styles.chipOn : ''}`} onClick={() => setOutcome(outcome === item.key ? null : item.key)}>
            {item.label}
          </button>
        ))}
      </div>
      <textarea className={styles.input} rows={2} maxLength={1000} placeholder="Anotação (opcional): o que combinou, melhor horário para retornar…" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <div className={styles.stateActions}>
        <button type="button" className={styles.callBtn} disabled={busy} onClick={() => onDone(outcome, notes, 'available')}>
          {busy ? <Loader2 size={16} className={styles.spin} /> : <Phone size={16} />} Próxima ligação
        </button>
        <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => onDone(outcome, notes, 'pause')}>
          <Coffee size={16} /> Salvar e pausar
        </button>
      </div>
    </div>
  );
}

/**
 * Console do atendente: ficar disponível, a ligação em andamento (com os
 * dados da planilha) e a finalização com o resultado.
 */
export default function AgentConsole({ state, phone, busy, error, callEnded, onGoAvailable, onPause, onLeave, onWrapup }: Props) {
  const status = state?.status || 'offline';
  // O navegador sabe antes do servidor que a ligação começou/terminou.
  const view = phone.inCall ? 'on_call' : status === 'on_call' && callEnded ? 'wrapup' : status;
  const elapsed = useElapsed(state?.since, view === 'on_call' || view === 'available' || view === 'paused');
  const contact = state?.contact;

  const icon = view === 'on_call' ? <PhoneIncoming size={24} /> : view === 'available' ? <Headphones size={24} /> : view === 'paused' ? <Coffee size={24} /> : view === 'wrapup' ? <Phone size={24} /> : <Power size={24} />;
  const title =
    view === 'available' ? 'Disponível: aguardando a próxima ligação'
    : view === 'on_call' ? 'Em ligação'
    : view === 'wrapup' ? 'Ligação encerrada'
    : view === 'paused' ? 'Em pausa'
    : 'Você está offline';
  const subtitle =
    view === 'available' ? `Há ${clock(elapsed)}. Quando alguém atender, a ligação entra sozinha no seu fone.`
    : view === 'on_call' ? `${clock(elapsed)} de conversa${contact ? ` · campanha ${contact.campaignName}` : ''}`
    : view === 'wrapup' ? 'Marque o resultado para receber a próxima.'
    : view === 'paused' ? `Pausado há ${clock(elapsed)}. Nenhuma ligação vai chegar para você.`
    : 'Fique disponível para receber as ligações das campanhas. Use fone de ouvido com microfone.';

  return (
    <section className={`${styles.card} ${styles.console}`} data-state={view} aria-live="polite">
      <div className={styles.stateRow}>
        <span className={`${styles.stateIcon} ${view === 'available' ? styles.pulse : ''}`}>{icon}</span>
        <div className={styles.stateText}>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className={styles.stateActions}>
          {(view === 'offline' || view === 'paused') && (
            <button type="button" className={styles.callBtn} disabled={busy || phone.state === 'starting' || !state?.connected} onClick={onGoAvailable}>
              {busy || phone.state === 'starting' ? <Loader2 size={16} className={styles.spin} /> : <Headphones size={16} />} Ficar disponível
            </button>
          )}
          {view === 'available' && (
            <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={onPause}><Coffee size={16} /> Pausar</button>
          )}
          {view !== 'offline' && view !== 'on_call' && (
            <button type="button" className={styles.ghostBtn} disabled={busy} onClick={onLeave}><LogOut size={16} /> Sair</button>
          )}
        </div>
      </div>

      {(error || phone.error) && <div className={styles.errorBox}><AlertTriangle size={16} /> <span>{error || phone.error}</span></div>}

      {(view === 'on_call' || view === 'wrapup') && contact && (
        <div className={styles.contactCard}>
          <div>
            <h3>{contact.name || 'Contato sem nome'}</h3>
            <span className={styles.contactPhone}>{formatPhone(contact.phone)}{contact.attempts > 1 ? ` · ${contact.attempts}ª tentativa` : ''}</span>
          </div>
          {view === 'on_call' && <span className={styles.timer}>{clock(elapsed)}</span>}
          {Object.keys(contact.data).length > 0 && (
            <dl className={styles.contactData}>
              {Object.entries(contact.data).map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          )}
        </div>
      )}

      {view === 'on_call' && (
        <div className={styles.callControls}>
          <button type="button" className={styles.secondaryBtn} onClick={phone.toggleMute} disabled={!phone.inCall}>
            {phone.muted ? <MicOff size={16} /> : <Mic size={16} />} {phone.muted ? 'Ativar microfone' : 'Silenciar'}
          </button>
          <button type="button" className={`${styles.primaryBtn} ${styles.hangup}`} onClick={phone.hangUp} disabled={!phone.inCall}>
            <PhoneOff size={16} /> Desligar
          </button>
          {!phone.inCall && <span className={styles.hint}>A ligação está aberta em outra aba ou aparelho.</span>}
        </div>
      )}

      {view === 'wrapup' && <WrapupForm key={contact?.id || 'none'} busy={busy} onDone={onWrapup} />}

      {state && state.running.length > 0 && view !== 'on_call' && (
        <div className={styles.runningList}>
          {state.running.map((campaign) => <span key={campaign.id}>{campaign.name}: {campaign.pending} na fila</span>)}
        </div>
      )}
      {state && state.running.length === 0 && view === 'available' && (
        <p className={styles.hint}>Nenhuma campanha ligando agora. Assim que um gerente começar uma, as ligações chegam aqui.</p>
      )}
    </section>
  );
}
