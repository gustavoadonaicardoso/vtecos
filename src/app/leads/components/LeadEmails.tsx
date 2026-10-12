'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Mail, PenSquare } from 'lucide-react';
import styles from '../leads.module.css';
import { formatDateTime } from '../format';

interface EmailItem {
  id: string;
  direction: 'in' | 'out';
  subject: string;
  snippet: string;
  sentAt: string;
}

type Loaded = { leadId: string; items: EmailItem[] } | { leadId: string; hidden: true };

/**
 * E-mails trocados com o lead (módulo E-mail). Some sozinho quando a empresa
 * não tem o módulo ou a pessoa não tem acesso aos e-mails.
 */
export default function LeadEmails({ leadId, email }: { leadId: string; email: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      fetch(`/api/email/lead?lead=${encodeURIComponent(leadId)}`)
        .then(async (response) => {
          const json = await response.json().catch(() => ({}));
          if (!alive) return;
          setLoaded(response.ok ? { leadId, items: (json.data?.items || []) as EmailItem[] } : { leadId, hidden: true });
        })
        .catch(() => alive && setLoaded({ leadId, hidden: true }));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [leadId]);

  if (!loaded || loaded.leadId !== leadId || 'hidden' in loaded) return null;
  const { items } = loaded;

  return (
    <details className={styles.extraSection} open={items.length > 0}>
      <summary>
        <Mail size={14} /> E-mails
        {items.length > 0 && <span className={styles.extraCount}>{items.length}</span>}
      </summary>
      <div className={styles.emailList}>
        {items.length === 0 && <p className={styles.hintText}>{email ? 'Nenhum e-mail com este lead ainda.' : 'Cadastre o e-mail do lead para ver e enviar e-mails por aqui.'}</p>}
        {items.map((item) => (
          <Link key={item.id} href={`/email?abrir=${item.id}`} className={styles.emailRow}>
            {item.direction === 'in' ? <ArrowDownLeft size={14} aria-label="Recebido" /> : <ArrowUpRight size={14} aria-label="Enviado" />}
            <span>
              <strong>{item.subject || '(sem assunto)'}</strong>
              <small>{formatDateTime(item.sentAt)}{item.snippet ? ` · ${item.snippet}` : ''}</small>
            </span>
          </Link>
        ))}
        {email && (
          <Link href={`/email?para=${encodeURIComponent(email)}`} className={styles.linkBtn}>
            <PenSquare size={14} /> Enviar e-mail
          </Link>
        )}
      </div>
    </details>
  );
}
