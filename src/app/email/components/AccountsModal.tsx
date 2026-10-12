'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { EMAIL_PRESETS } from '@/lib/email/presets';
import styles from '../email.module.css';
import { api, fullDate, jsonInit, type Account } from '../types';

interface FormState {
  kind: 'shared' | 'personal';
  preset: string;
  name: string;
  email_address: string;
  from_name: string;
  password: string;
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
  username: string;
  signature: string;
  notify: boolean;
}

const blank = (canShared: boolean): FormState => {
  const preset = EMAIL_PRESETS[0];
  return {
    kind: canShared ? 'shared' : 'personal',
    preset: preset.key,
    name: '',
    email_address: '',
    from_name: '',
    password: '',
    imap_host: preset.imapHost,
    imap_port: String(preset.imapPort),
    smtp_host: preset.smtpHost,
    smtp_port: String(preset.smtpPort),
    username: '',
    signature: '',
    notify: true,
  };
};

const fromAccount = (account: Account): FormState => ({
  kind: account.kind,
  preset: EMAIL_PRESETS.find((item) => item.imapHost === account.imapHost)?.key || 'custom',
  name: account.name,
  email_address: account.emailAddress,
  from_name: account.fromName,
  password: '',
  imap_host: account.imapHost,
  imap_port: String(account.imapPort),
  smtp_host: account.smtpHost,
  smtp_port: String(account.smtpPort),
  username: account.username,
  signature: account.signature,
  notify: account.notify,
});

interface Props {
  accounts: Account[];
  canShared: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function AccountsModal({ accounts, canShared, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState<Account | 'new' | null>(accounts.length ? null : 'new');
  const [form, setForm] = useState<FormState>(() => blank(canShared));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const preset = EMAIL_PRESETS.find((item) => item.key === form.preset) || EMAIL_PRESETS[EMAIL_PRESETS.length - 1];

  const choosePreset = (key: string) => {
    const next = EMAIL_PRESETS.find((item) => item.key === key)!;
    setForm((current) => ({
      ...current,
      preset: key,
      imap_host: key === 'custom' ? current.imap_host : next.imapHost,
      imap_port: String(next.imapPort),
      smtp_host: key === 'custom' ? current.smtp_host : next.smtpHost,
      smtp_port: String(next.smtpPort),
    }));
  };

  const openNew = () => {
    setForm(blank(canShared));
    setEditing('new');
    setError('');
    setSaved('');
  };

  const openEdit = (account: Account) => {
    setForm(fromAccount(account));
    setEditing(account);
    setError('');
    setSaved('');
  };

  const save = async () => {
    setBusy('save');
    setError('');
    const payload = { ...form, imap_port: Number(form.imap_port), smtp_port: Number(form.smtp_port), username: form.username || form.email_address };
    try {
      if (editing === 'new') await api('/api/email/accounts', jsonInit('POST', payload));
      else if (editing) await api(`/api/email/accounts/${editing.id}`, jsonInit('PATCH', payload));
      setSaved(editing === 'new' ? 'Caixa conectada. Os e-mails dos últimos 14 dias chegam em instantes.' : 'Caixa atualizada.');
      setEditing(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
    setBusy(null);
  };

  const act = async (account: Account, action: 'pause' | 'resume' | 'delete') => {
    if (action === 'delete' && !window.confirm(`Desconectar ${account.emailAddress}? Os e-mails guardados no sistema somem (no seu provedor nada muda).`)) return;
    setBusy(`${action}:${account.id}`);
    setError('');
    try {
      if (action === 'delete') await api(`/api/email/accounts/${account.id}`, { method: 'DELETE' });
      else await api(`/api/email/accounts/${account.id}`, jsonInit('PATCH', { action }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível.');
    }
    setBusy(null);
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Caixas de e-mail">
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHead}>
          <h2>{editing === 'new' ? 'Conectar caixa' : editing ? `Editar ${editing.emailAddress}` : 'Caixas de e-mail'}</h2>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        {!editing ? (
          <>
            <div className={styles.modalBody}>
              {saved && <div className={styles.okBox}><CheckCircle2 size={16} /> {saved}</div>}
              {error && <div className={styles.errorBox}>{error}</div>}
              {accounts.length === 0 && <p className={styles.empty}>Nenhuma caixa conectada ainda.</p>}
              <div className={styles.accountCards}>
                {accounts.map((account) => (
                  <div key={account.id} className={styles.accountCard}>
                    <div>
                      <strong>
                        <span className={`${styles.statusDot} ${styles[`dot_${account.status}`]}`} aria-hidden />
                        {account.name}
                        <span className={styles.kindTag}>{account.kind === 'shared' ? 'Empresa' : 'Pessoal'}</span>
                      </strong>
                      <small>{account.emailAddress} · {account.status === 'paused' ? 'pausada' : account.lastSyncAt ? `atualizada ${fullDate(account.lastSyncAt)}` : 'aguardando a primeira busca'}</small>
                    </div>
                    {account.canManage && (
                      <div className={styles.cardActions}>
                        <button type="button" className={styles.secondaryBtn} onClick={() => openEdit(account)}><Pencil size={14} /> Editar</button>
                        <button type="button" className={styles.secondaryBtn} onClick={() => act(account, account.status === 'paused' ? 'resume' : 'pause')} disabled={busy !== null}>
                          {account.status === 'paused' ? <><Play size={14} /> Retomar</> : <><Pause size={14} /> Pausar</>}
                        </button>
                        <button type="button" className={styles.dangerBtn} onClick={() => act(account, 'delete')} disabled={busy !== null} aria-label={`Desconectar ${account.emailAddress}`}>
                          {busy === `delete:${account.id}` ? <Loader2 size={14} className={styles.spin} /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    )}
                    {account.status === 'error' && account.lastError && <p className={styles.cardError}>{account.lastError}</p>}
                  </div>
                ))}
              </div>
              <p className={styles.hint}>
                Caixas da <strong>empresa</strong> (ex.: contato@) aparecem para todos com a permissão E-mail; só administradores e gerentes conectam. A caixa <strong>pessoal</strong> só você vê.
              </p>
            </div>
            <div className={styles.modalFoot}>
              <button type="button" className={styles.primaryBtn} onClick={openNew}><Plus size={16} /> Conectar caixa</button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.modalBody}>
              {editing === 'new' && (
                <div className={styles.kindChoice}>
                  <button type="button" className={`${styles.choice} ${form.kind === 'shared' ? styles.choiceOn : ''}`} onClick={() => set('kind', 'shared')} disabled={!canShared}>
                    <strong>Da empresa</strong>
                    <small>{canShared ? 'Ex.: contato@. A equipe com permissão vê e responde.' : 'Só administradores e gerentes conectam.'}</small>
                  </button>
                  <button type="button" className={`${styles.choice} ${form.kind === 'personal' ? styles.choiceOn : ''}`} onClick={() => set('kind', 'personal')}>
                    <strong>Pessoal</strong>
                    <small>Seu e-mail de trabalho. Só você vê.</small>
                  </button>
                </div>
              )}
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span>Provedor</span>
                  <select className={styles.input} value={form.preset} onChange={(e) => choosePreset(e.target.value)}>
                    {EMAIL_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>E-mail da caixa</span>
                  <input className={styles.input} type="email" value={form.email_address} onChange={(e) => set('email_address', e.target.value)} placeholder="contato@suaempresa.com.br" autoComplete="off" />
                </label>
              </div>
              <p className={styles.hint}>{preset.hint}</p>
              <div className={styles.row2}>
                <label className={styles.field}>
                  <span>Senha da caixa {editing !== 'new' && '(em branco = manter)'}</span>
                  <input className={styles.input} type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder={editing !== 'new' ? '••••••••' : ''} />
                </label>
                <label className={styles.field}>
                  <span>Nome que o cliente vê</span>
                  <input className={styles.input} value={form.from_name} onChange={(e) => set('from_name', e.target.value)} placeholder="Ex.: Vórtice Tecnologia" maxLength={80} />
                </label>
              </div>
              <label className={styles.field}>
                <span>Nome da caixa no sistema</span>
                <input className={styles.input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Contato, Financeiro, Meu e-mail" maxLength={60} />
              </label>
              <label className={styles.field}>
                <span>Assinatura (vai no fim de cada e-mail)</span>
                <textarea className={styles.input} rows={3} value={form.signature} onChange={(e) => set('signature', e.target.value)} placeholder={'Ana Souza\nDoces da Ana · (11) 99999-0000'} maxLength={2000} />
              </label>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={form.notify} onChange={(e) => set('notify', e.target.checked)} />
                <span>Avisar no sino quando chegar e-mail{form.kind === 'shared' ? ' (para quem tem acesso ao E-mail)' : ''}</span>
              </label>
              <details className={styles.details} open={form.preset === 'custom'}>
                <summary>Servidores (avançado)</summary>
                <div className={styles.row3}>
                  <label className={styles.field}><span>Servidor de entrada (IMAP)</span><input className={styles.input} value={form.imap_host} onChange={(e) => set('imap_host', e.target.value)} placeholder="imap.seuprovedor.com" /></label>
                  <label className={styles.field}><span>Porta</span><input className={styles.input} inputMode="numeric" value={form.imap_port} onChange={(e) => set('imap_port', e.target.value)} /></label>
                </div>
                <div className={styles.row3} style={{ marginTop: 10 }}>
                  <label className={styles.field}><span>Servidor de saída (SMTP)</span><input className={styles.input} value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.seuprovedor.com" /></label>
                  <label className={styles.field}><span>Porta</span><input className={styles.input} inputMode="numeric" value={form.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} /></label>
                </div>
                <label className={styles.field} style={{ marginTop: 10 }}>
                  <span>Usuário (se for diferente do e-mail)</span>
                  <input className={styles.input} value={form.username} onChange={(e) => set('username', e.target.value)} placeholder={form.email_address || 'o próprio e-mail'} autoComplete="off" />
                </label>
                <p className={styles.hint} style={{ marginTop: 8 }}>993 e 465 = conexão segura (SSL); 143 e 587 = STARTTLS.</p>
              </details>
              {error && <div className={styles.errorBox}>{error}</div>}
            </div>
            <div className={styles.modalFoot}>
              <span className={styles.footInfo}>Testamos a entrada e a saída antes de salvar.</span>
              {(accounts.length > 0 || editing !== 'new') && <button type="button" className={styles.secondaryBtn} onClick={() => setEditing(null)} disabled={busy !== null}>Voltar</button>}
              <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy !== null}>
                {busy === 'save' ? <><Loader2 size={16} className={styles.spin} /> Testando...</> : editing === 'new' ? 'Conectar' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
