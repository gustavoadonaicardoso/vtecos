'use client';

import React, { useState } from 'react';
import { KeyRound, Phone, Plug, PlugZap, Save, Search, Sparkles, Trash2 } from 'lucide-react';
import styles from '../integrations.module.css';
import { api, BusyIcon, FeedbackBox, removeProvider, saveProvider } from './shared';
import { runTest, useActions, type PanelProps } from './panels';

// ── Discador (Twilio) ────────────────────────────────────────

interface TwilioNumber { phoneNumber: string; friendlyName: string; voice: boolean }

export function TwilioPanel({ integration, onChanged }: PanelProps) {
  const saved = integration?.config || {};
  const [form, setForm] = useState({ accountSid: String(saved.accountSid || ''), authToken: '' });
  const [numbers, setNumbers] = useState<TwilioNumber[] | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(String(saved.phoneNumber || ''));
  const [editing, setEditing] = useState(!integration);
  const { busy, feedback, setFeedback, run } = useActions(onChanged);

  const findNumbers = (event: React.FormEvent) => {
    event.preventDefault();
    run('numbers', async () => {
      const result = await api<{ numbers: TwilioNumber[]; accountName: string }>('/api/integrations/twilio', { method: 'POST', body: JSON.stringify({ action: 'numbers', ...form }) });
      setNumbers(result.numbers);
      const voice = result.numbers.filter((item) => item.voice);
      if (voice.length === 0) throw new Error('Essa conta ainda não tem número com voz. Compre um número no Twilio (Phone Numbers > Buy a number) e tente de novo.');
      if (!voice.some((item) => item.phoneNumber === phoneNumber)) setPhoneNumber(voice[0].phoneNumber);
      return `Conta "${result.accountName}" encontrada. Escolha o número das ligações.`;
    });
  };

  const connect = () => {
    run('connect', async () => {
      const result = await api<{ phoneNumber: string }>('/api/integrations/twilio', { method: 'POST', body: JSON.stringify({ action: 'connect', ...form, phoneNumber }) });
      setEditing(false);
      setNumbers(null);
      setForm((current) => ({ ...current, authToken: '' }));
      return `Discador conectado com o número ${result.phoneNumber}. Já dá para ligar pelo Discador e pelo card do lead.`;
    });
  };

  const disconnect = () => {
    if (!confirm('Desconectar o Discador? As ligações param até alguém conectar de novo. A chave e o app criados na sua conta Twilio também são apagados.')) return;
    run('remove', async () => {
      await api('/api/integrations/twilio', { method: 'DELETE' });
      setEditing(true);
      return 'Discador desconectado.';
    });
  };

  return (
    <div className={styles.panelBody}>
      {integration && !editing ? (
        <>
          <div className={`${styles.statusCard} ${styles.statusOk}`}>
            <PlugZap size={20} />
            <div>
              <strong>Conectado: {String(saved.phoneNumber || '')}</strong>
              <span>Conta {String(saved.accountName || saved.accountSid || '')}. As ligações saem por esse número e são cobradas na sua conta Twilio.</span>
            </div>
          </div>
          <FeedbackBox feedback={feedback} />
          <div className={styles.actions}>
            <button type="button" className={styles.dangerBtn} disabled={busy !== null} onClick={disconnect}>
              <BusyIcon busy={busy === 'remove'} icon={<Trash2 size={16} />} /> Desconectar
            </button>
            <span className={styles.spacer} />
            <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => { setFeedback(null); setEditing(true); }}>
              <Phone size={16} /> Trocar número
            </button>
            <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => run('test', () => runTest('twilio'))}>
              <BusyIcon busy={busy === 'test'} icon={<Plug size={16} />} /> Testar
            </button>
          </div>
        </>
      ) : (
        <form className={styles.panelBody} onSubmit={findNumbers}>
          <p className={styles.hint}>Cole os dados da <strong>sua</strong> conta Twilio (painel do Twilio, quadro Account Info). O vtec os cria sozinho a chave de API e o aplicativo de voz na sua conta.</p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Account SID</span>
              <input className={styles.input} value={form.accountSid} placeholder="AC…" autoComplete="off" onChange={(e) => { setForm({ ...form, accountSid: e.target.value.trim() }); setNumbers(null); }} required />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Auth Token</span>
              <input className={styles.input} type="password" autoComplete="new-password" value={form.authToken} placeholder="32 caracteres" onChange={(e) => { setForm({ ...form, authToken: e.target.value.trim() }); setNumbers(null); }} required />
            </label>
          </div>

          {numbers && (
            <label className={styles.field}>
              <span className={styles.label}>Número das ligações</span>
              <select className={styles.input} value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}>
                {numbers.map((item) => (
                  <option key={item.phoneNumber} value={item.phoneNumber} disabled={!item.voice}>
                    {item.phoneNumber}{item.friendlyName !== item.phoneNumber ? ` · ${item.friendlyName}` : ''}{item.voice ? '' : ' (sem voz)'}
                  </option>
                ))}
              </select>
            </label>
          )}

          <FeedbackBox feedback={feedback} />

          <div className={styles.actions}>
            {integration && (
              <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => { setEditing(false); setNumbers(null); setFeedback(null); }}>Cancelar</button>
            )}
            <span className={styles.spacer} />
            {numbers && numbers.some((item) => item.voice) ? (
              <button type="button" className={styles.primaryBtn} disabled={busy !== null || !phoneNumber} onClick={connect}>
                <BusyIcon busy={busy === 'connect'} icon={<PlugZap size={16} />} /> Conectar
              </button>
            ) : (
              <button type="submit" className={styles.primaryBtn} disabled={busy !== null}>
                <BusyIcon busy={busy === 'numbers'} icon={<Search size={16} />} /> Verificar conta
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

// ── Inteligência artificial ──────────────────────────────────

export function AiPanel({ integration, overview, onChanged }: PanelProps) {
  const [geminiKey, setGeminiKey] = useState('');
  const { busy, feedback, run } = useActions(onChanged);
  const own = Boolean(integration);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    run('save', async () => {
      await saveProvider('ai', { geminiKey });
      setGeminiKey('');
      return 'Chave salva e conferida. A partir de agora a IA desta empresa usa (e é cobrada na) sua chave do Gemini.';
    });
  };

  return (
    <form className={styles.panelBody} onSubmit={save}>
      <div className={`${styles.statusCard} ${own || overview.platformAi ? styles.statusOk : ''}`}>
        <Sparkles size={20} />
        <div>
          <strong>{own ? 'Usando a sua chave do Gemini' : overview.platformAi ? 'Usando a IA da Vórtice' : 'Nenhuma IA disponível'}</strong>
          <span>
            {own
              ? 'O Atendente com IA, as legendas e as notas fiscais desta empresa usam a sua chave do Google.'
              : overview.platformAi
                ? 'Já está funcionando, sem configurar nada. Se preferir usar a sua própria conta do Google (e ter os seus limites), cadastre a chave abaixo.'
                : 'Cadastre a sua chave do Gemini para usar o Atendente com IA, as legendas e as notas fiscais.'}
          </span>
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Chave da API do Gemini (opcional)</span>
        <input className={styles.input} type="password" autoComplete="new-password" value={geminiKey} placeholder={own ? '•••••••• salva — cole outra para trocar' : 'AIza…'} onChange={(e) => setGeminiKey(e.target.value.trim())} />
        <small className={styles.hint}>Crie em aistudio.google.com/app/apikey (veja o Passo a passo). A chave é conferida antes de salvar e nunca aparece de novo na tela.</small>
      </label>

      <FeedbackBox feedback={feedback} />

      <div className={styles.actions}>
        {own && (
          <button type="button" className={styles.dangerBtn} disabled={busy !== null} onClick={() => confirm(overview.platformAi ? 'Remover a sua chave? A empresa volta a usar a IA da Vórtice.' : 'Remover a sua chave? A IA desta empresa para de funcionar.') && run('remove', async () => { await removeProvider('ai'); return overview.platformAi ? 'Chave removida: a empresa voltou a usar a IA da Vórtice.' : 'Chave removida.'; })}>
            <BusyIcon busy={busy === 'remove'} icon={<Trash2 size={16} />} /> {overview.platformAi ? 'Voltar para a IA da Vórtice' : 'Remover chave'}
          </button>
        )}
        <span className={styles.spacer} />
        {own && (
          <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => run('test', () => runTest('ai'))}>
            <BusyIcon busy={busy === 'test'} icon={<Plug size={16} />} /> Testar chave
          </button>
        )}
        <button type="submit" className={styles.primaryBtn} disabled={busy !== null || !geminiKey}>
          <BusyIcon busy={busy === 'save'} icon={geminiKey ? <Save size={16} /> : <KeyRound size={16} />} /> Salvar chave
        </button>
      </div>
    </form>
  );
}
