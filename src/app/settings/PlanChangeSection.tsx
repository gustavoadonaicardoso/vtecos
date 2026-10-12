'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Check, Loader2, Repeat, Users, X } from 'lucide-react';
import styles from './settings.module.css';
import local from './PlanChange.module.css';
import { changeMode, cyclePrice, type Cycle, type PlanChangeView, type PlanOption } from '@/lib/plan-change';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0 });
const brDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
const cycleWord = (cycle: Cycle) => (cycle === 'YEARLY' ? 'anual' : 'mensal');

/** Configurações > Plano: trocar de plano ou de ciclo sem falar com a Vórtice. */
export default function PlanChangeSection({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [view, setView] = useState<PlanChangeView | null>(null);
  const [cycle, setCycle] = useState<Cycle>('MONTHLY');
  const [target, setTarget] = useState<PlanOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const apply = (next: PlanChangeView | null) => {
    setView(next);
    if (next) setCycle(next.pending?.cycle || next.cycle);
  };

  const load = useCallback(async () => {
    const response = await fetch('/api/billing/plan', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (response.ok) apply(json.data);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!view) return null;
  const current = view.options.find((option) => option.current) || null;

  const submit = async (method: 'POST' | 'DELETE', body?: unknown) => {
    setBusy(true);
    setError('');
    const response = await fetch('/api/billing/plan', { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(json.error || 'Não foi possível trocar o plano agora.');
      return false;
    }
    apply(json.data.view);
    const result = json.data.result;
    setNotice(method === 'DELETE'
      ? `Troca cancelada: vocês seguem no plano ${result.planName}.`
      : result.mode === 'next_invoice'
        ? `Pronto! O plano ${result.planName} começa em ${brDate(result.effectiveOn)}. Até lá, nada muda.`
        : `Pronto! Vocês já estão no plano ${result.planName} (${cycleWord(result.cycle)}).`);
    setTarget(null);
    await onChanged();
    return true;
  };

  // O que acontece se trocar para `option` no ciclo escolhido.
  const describe = (option: PlanOption) => {
    const value = cyclePrice(option.price, cycle);
    const mode = option.current ? 'now' : changeMode(view.status, current?.price ?? 0, option.price);
    const lost = current ? current.modules.filter((module) => !option.modules.some((item) => item.key === module.key)) : [];
    const gained = current ? option.modules.filter((module) => !current.modules.some((item) => item.key === module.key)) : option.modules;
    return { value, mode, lost, gained };
  };

  const confirmText = target ? describe(target) : null;
  const isCurrentChoice = (option: PlanOption) => option.current && cycle === view.cycle && !view.pending;
  const isPendingChoice = (option: PlanOption) => view.pending?.planId === option.id && view.pending?.cycle === cycle;

  return (
    <div className={local.section}>
      <div className={local.head}>
        <div>
          <span className={styles.eyebrow}><Repeat size={13} /> Trocar de plano</span>
          <p className={styles.hint}>Subir de plano libera os módulos na hora. Descer vale a partir do vencimento da fatura em aberto (o período já pago continua igual).</p>
        </div>
        <div className={local.cycle} role="radiogroup" aria-label="Forma de cobrança">
          <button type="button" role="radio" aria-checked={cycle === 'MONTHLY'} className={cycle === 'MONTHLY' ? local.cycleOn : ''} onClick={() => setCycle('MONTHLY')}>Mensal</button>
          <button type="button" role="radio" aria-checked={cycle === 'YEARLY'} className={cycle === 'YEARLY' ? local.cycleOn : ''} onClick={() => setCycle('YEARLY')}>Anual <small>2 meses grátis</small></button>
        </div>
      </div>

      {!view.allowed && <div className={local.blocked}>{view.reason}</div>}

      {view.pending && (
        <div className={local.pending}>
          <CalendarClock size={18} />
          <span>
            Troca agendada: plano <strong>{view.pending.planName}</strong> ({cycleWord(view.pending.cycle)}) a partir de <strong>{brDate(view.pending.effectiveOn)}</strong>. Até lá, vocês seguem com o plano atual.
          </span>
          <button type="button" className={styles.secondaryBtn} onClick={() => submit('DELETE')} disabled={busy}>Manter plano atual</button>
        </div>
      )}

      {notice && <div className={local.notice} role="status"><Check size={15} /> {notice}</div>}
      {error && !target && <div className={local.error}>{error}</div>}

      <div className={local.grid}>
        {view.options.map((option) => {
          const info = describe(option);
          const overLimit = option.maxUsers !== null && view.activeUsers > option.maxUsers;
          const currentChoice = isCurrentChoice(option);
          const pendingChoice = isPendingChoice(option);
          // Com troca agendada, escolher o plano atual no mesmo ciclo = desistir da troca.
          const keepCurrent = option.current && cycle === view.cycle && Boolean(view.pending);
          const label = currentChoice ? 'Seu plano' : pendingChoice ? 'Agendado' : keepCurrent ? 'Manter este plano' : option.current ? `Passar para ${cycleWord(cycle)}` : info.mode === 'next_invoice' ? 'Descer para este plano' : 'Mudar para este plano';
          return (
            <div key={option.id} className={`${local.card} ${option.current ? local.cardCurrent : ''}`}>
              <div className={local.cardTop}>
                <strong>{option.name}</strong>
                {option.current && <span className={`${styles.badge} ${styles.badgeOk}`}>Atual</span>}
              </div>
              <span className={local.price}>
                {money(info.value)}<small>/{cycle === 'YEARLY' ? 'ano' : 'mês'}</small>
              </span>
              {cycle === 'YEARLY' && <span className={local.sub}>equivale a {money(info.value / 12)}/mês</span>}
              <span className={local.sub}><Users size={12} /> {option.maxUsers === null ? 'Usuários sem limite' : `Até ${option.maxUsers} usuário${option.maxUsers === 1 ? '' : 's'}`}</span>
              <ul className={local.modules}>
                {option.modules.map((module) => <li key={module.key}><Check size={12} /> {module.label}</li>)}
              </ul>
              {overLimit && !option.current && <span className={local.warn}>Vocês têm {view.activeUsers} usuários ativos: desative alguém em Equipe para escolher este plano.</span>}
              <button
                type="button"
                className={currentChoice || pendingChoice ? styles.secondaryBtn : styles.primaryBtn}
                disabled={!view.allowed || busy || currentChoice || pendingChoice || (overLimit && !option.current)}
                onClick={() => {
                  setError('');
                  setNotice('');
                  if (keepCurrent) void submit('DELETE');
                  else setTarget(option);
                }}
              >
                {!currentChoice && !pendingChoice && !option.current && (info.mode === 'next_invoice' ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />)}
                {label}
              </button>
            </div>
          );
        })}
      </div>

      {target && confirmText && (
        <div className={local.overlay} onClick={() => !busy && setTarget(null)}>
          <div className={local.modal} role="dialog" aria-modal="true" aria-labelledby="plan-confirm-title" onClick={(event) => event.stopPropagation()}>
            <div className={local.modalHead}>
              <h3 id="plan-confirm-title">{target.current ? `Cobrança ${cycleWord(cycle)}` : `Plano ${target.name}`}</h3>
              <button type="button" className={styles.ghostBtn} onClick={() => setTarget(null)} aria-label="Fechar" disabled={busy}><X size={18} /></button>
            </div>
            <p className={local.big}>{money(confirmText.value)}<small>/{cycle === 'YEARLY' ? 'ano' : 'mês'}</small></p>
            <ul className={local.steps}>
              {view.status === 'trial' ? (
                <li>Durante o teste grátis a troca vale na hora. A primeira fatura passa a ser de <strong>{money(confirmText.value)}</strong>.</li>
              ) : confirmText.mode === 'next_invoice' ? (
                <>
                  <li>Até <strong>{brDate(view.nextDue)}</strong> vocês continuam com o plano {current?.name} (o período já pago).</li>
                  <li>A partir daí, plano <strong>{target.name}</strong>: a fatura em aberto já passa a ser de <strong>{money(confirmText.value)}</strong>.</li>
                </>
              ) : target.current ? (
                <li>A fatura em aberto passa a ser {cycleWord(cycle)}, de <strong>{money(confirmText.value)}</strong>. Os módulos não mudam.</li>
              ) : (
                <>
                  <li>Os módulos novos liberam <strong>na hora</strong>.</li>
                  <li>A fatura em aberto passa a ser de <strong>{money(confirmText.value)}</strong> ({cycleWord(cycle)}).</li>
                </>
              )}
              {confirmText.gained.length > 0 && !target.current && <li>Entram: {confirmText.gained.map((module) => module.label).join(', ')}.</li>}
              {confirmText.lost.length > 0 && !target.current && <li className={local.lost}>Saem: {confirmText.lost.map((module) => module.label).join(', ')}. A equipe deixa de ver essas telas{confirmText.mode === 'next_invoice' ? ' na data da troca' : ''} (os dados ficam guardados).</li>}
            </ul>
            {error && <div className={local.error}>{error}</div>}
            <div className={local.modalActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setTarget(null)} disabled={busy}>Voltar</button>
              <button type="button" className={styles.primaryBtn} onClick={() => submit('POST', { planId: target.id, cycle })} disabled={busy}>
                {busy && <Loader2 size={15} className={styles.spin} />} Confirmar troca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
