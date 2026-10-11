'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Check, Kanban, MessageCircle, PartyPopper, Rocket, UserPlus, Users, X, Zap } from 'lucide-react';
import styles from './OnboardingChecklist.module.css';
import type { OnboardingKey, OnboardingView } from '@/lib/onboarding';

const ICONS: Record<OnboardingKey, React.ComponentType<{ size?: number }>> = {
  whatsapp: MessageCircle,
  team: UserPlus,
  leads: Users,
  pipeline: Kanban,
  quick_replies: Zap,
};

/** Primeiros passos de uma empresa nova (Início). Some quando tudo foi feito e a pessoa fecha. */
export default function OnboardingChecklist({ companyName }: { companyName?: string }) {
  const [view, setView] = useState<OnboardingView | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/onboarding', { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      setView(response.ok ? json.data || null : null);
    } catch {
      setView(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    // Volta para a aba (depois de conectar o WhatsApp em outra tela, por exemplo): confere de novo.
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const dismiss = async () => {
    if (!view?.allDone && !confirm('Ocultar os primeiros passos? Você pode fazer cada um quando quiser pelo menu.')) return;
    setClosing(true);
    await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss' }) }).catch(() => null);
    setView(null);
  };

  if (!view) return null;
  const percent = Math.round((view.done / Math.max(1, view.total)) * 100);
  const next = view.steps.find((step) => !step.done);

  if (view.allDone) {
    return (
      <section className={`${styles.box} ${styles.doneBox}`} aria-label="Primeiros passos concluídos">
        <span className={styles.badge}><PartyPopper size={20} /></span>
        <div className={styles.doneText}>
          <strong>Tudo pronto{companyName ? `, ${companyName}` : ''}!</strong>
          <span>Você concluiu os primeiros passos. Agora é vender: as conversas chegam em Mensagens e o funil mostra onde cada cliente está.</span>
        </div>
        <button type="button" className={styles.primary} onClick={dismiss} disabled={closing}>Fechar</button>
      </section>
    );
  }

  return (
    <section className={styles.box} aria-label="Primeiros passos">
      <header className={styles.head}>
        <div className={styles.title}>
          <span className={styles.badge}><Rocket size={18} /></span>
          <div>
            <h2>Primeiros passos</h2>
            <p>{view.done} de {view.total} concluídos · deixe o sistema pronto para a sua equipe</p>
          </div>
        </div>
        <button type="button" className={styles.close} onClick={dismiss} disabled={closing} aria-label="Ocultar primeiros passos" title="Ocultar">
          <X size={16} />
        </button>
      </header>

      <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Progresso dos primeiros passos">
        <span style={{ width: `${percent}%` }} />
      </div>

      <ol className={styles.list}>
        {view.steps.map((step) => {
          const Icon = ICONS[step.key] || Building2;
          const isNext = next?.key === step.key;
          return (
            <li key={step.key} className={`${styles.step} ${step.done ? styles.stepDone : ''} ${isNext ? styles.stepNext : ''}`}>
              <span className={styles.check} aria-hidden="true">{step.done ? <Check size={14} /> : <Icon size={15} />}</span>
              <div className={styles.stepText}>
                <strong>{step.title}</strong>
                <span>{step.done ? 'Concluído' : step.description}</span>
              </div>
              {!step.done && (
                <Link href={step.href} className={isNext ? styles.primary : styles.secondary}>
                  {step.cta} <ArrowRight size={14} />
                </Link>
              )}
              <span className={styles.srOnly}>{step.done ? 'concluído' : 'pendente'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
