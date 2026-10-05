'use client';

import { useEffect, useState } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './SupportAccessBar.module.css';

/**
 * Faixa do modo suporte: admin da Vórtice dentro da empresa de um
 * cliente. Fica sempre visível, mostra até quando vale e tem o "Sair".
 */
export default function SupportAccessBar() {
  const { user } = useAuth();
  const access = user?.support_access;
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!access) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [access]);

  // Venceu: recarrega já fora da empresa do cliente.
  const expired = Boolean(access && new Date(access.expires_at).getTime() <= now);
  useEffect(() => {
    if (expired) window.location.href = '/master';
  }, [expired]);

  if (!access) return null;

  const leave = async () => {
    setLeaving(true);
    await fetch('/api/support-access', { method: 'DELETE' }).catch(() => undefined);
    window.location.href = '/master';
  };

  const until = new Date(access.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={styles.bar} role="status">
      <ShieldAlert size={16} />
      <span className={styles.text}>
        <strong>Modo suporte:</strong> você está em <strong>{access.tenant_name}</strong> como administrador · até {until}
      </span>
      <button type="button" className={styles.leave} onClick={leave} disabled={leaving}>
        <LogOut size={14} /> {leaving ? 'Saindo…' : 'Sair'}
      </button>
    </div>
  );
}
