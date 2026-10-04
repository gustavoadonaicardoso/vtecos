'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, KeyRound, Plug, PlugZap, QrCode, RefreshCcw, Save, Send, Trash2 } from 'lucide-react';
import styles from '../integrations.module.css';
import RichText from '@/components/help/RichText';
import type { DeliveryInfo, IntegrationView, Overview } from '../constants';
import {
  api,
  BusyIcon,
  CopyField,
  FeedbackBox,
  LastDelivery,
  removeProvider,
  saveProvider,
  testProvider,
  type Feedback,
} from './shared';

interface PanelProps {
  integration: IntegrationView | null;
  overview: Overview;
  onChanged: () => Promise<void>;
}

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

/** Botões de salvar/testar/remover com o mesmo comportamento em todos os painéis. */
function useActions(onChanged: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const run = useCallback(async (name: string, action: () => Promise<string | void>) => {
    setBusy(name);
    setFeedback(null);
    try {
      const message = await action();
      if (message) setFeedback({ type: 'success', text: message });
      await onChanged();
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir.' });
    } finally {
      setBusy(null);
    }
  }, [onChanged]);
  return { busy, feedback, setFeedback, run };
}

async function runTest(provider: Parameters<typeof testProvider>[0]) {
  const result = await testProvider(provider);
  if (!result.ok) throw new Error(result.message);
  return result.message;
}

// ── WhatsApp Web ─────────────────────────────────────────────

export function WhatsAppWebPanel({ overview, onChanged }: PanelProps) {
  const [status, setStatus] = useState(overview.whatsappWeb);
  const [waiting, setWaiting] = useState(false);
  const attempts = useRef(0);
  const { busy, feedback, setFeedback, run } = useActions(onChanged);

  const start = async () => {
    setFeedback(null);
    setWaiting(true);
    attempts.current = 0;
    const response = await fetch('/api/whatsapp/web/connection', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWaiting(false);
      setFeedback({ type: 'error', text: json.error || 'Não foi possível gerar o QR Code.' });
      return;
    }
    setStatus(json);
  };

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(async () => {
      attempts.current += 1;
      const response = await fetch('/api/whatsapp/web/connection', { cache: 'no-store' }).catch(() => null);
      const json = response ? await response.json().catch(() => null) : null;
      if (json) setStatus(json);
      if (json?.connected) {
        setWaiting(false);
        setFeedback({ type: 'success', text: 'WhatsApp conectado. As mensagens já chegam em Mensagens.' });
        onChanged();
      } else if (attempts.current >= 60) {
        setWaiting(false);
        setFeedback({ type: 'error', text: 'O QR Code expirou. Clique em Gerar QR Code de novo.' });
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [waiting, onChanged, setFeedback]);

  const disconnect = () => {
    if (!confirm('Desconectar o WhatsApp? As mensagens deixam de chegar até você ler um novo QR Code.')) return;
    run('disconnect', async () => {
      await api('/api/whatsapp/web/connection', { method: 'DELETE' });
      // Linha antiga da tela anterior (só guardava um nome); limpeza opcional.
      await removeProvider('whatsapp_web').catch(() => undefined);
      setStatus({ status: 'idle', connected: false, qrCode: null, phone: null });
      return 'WhatsApp desconectado.';
    });
  };

  const connected = Boolean(status?.connected);

  return (
    <div className={styles.panelBody}>
      <div className={`${styles.statusCard} ${connected ? styles.statusOk : ''}`}>
        <PlugZap size={20} />
        <div>
          <strong>{connected ? 'Conectado' : waiting ? 'Aguardando a leitura do QR Code' : 'Desconectado'}</strong>
          <span>{connected ? `Número ${status?.phone || 'conectado'}` : 'Gere o QR Code e leia com o WhatsApp do celular da empresa.'}</span>
        </div>
      </div>

      {!connected && status?.qrCode && (
        <div className={styles.qrBox}>
          <Image src={status.qrCode} alt="QR Code do WhatsApp" width={240} height={240} unoptimized />
          <span>WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho</span>
        </div>
      )}

      <FeedbackBox feedback={feedback} />

      <div className={styles.actions}>
        {connected ? (
          <button type="button" className={styles.dangerBtn} onClick={disconnect} disabled={busy !== null}>
            <BusyIcon busy={busy === 'disconnect'} icon={<Trash2 size={16} />} /> Desconectar
          </button>
        ) : (
          <button type="button" className={styles.primaryBtn} onClick={start} disabled={waiting && !status?.qrCode}>
            <BusyIcon busy={waiting && !status?.qrCode} icon={<QrCode size={16} />} /> {status?.qrCode ? 'Gerar novo QR Code' : 'Gerar QR Code'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── WhatsApp Business API (Meta) ─────────────────────────────

export function WhatsAppApiPanel({ integration, onChanged }: PanelProps) {
  const saved = integration?.config || {};
  const [form, setForm] = useState({
    token: '',
    appSecret: '',
    phoneId: String(saved.phoneId || ''),
    wabaId: String(saved.wabaId || ''),
  });
  const { busy, feedback, run } = useActions(onChanged);
  const hasToken = integration?.secrets?.token;
  const hasSecret = integration?.secrets?.appSecret;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    run('save', async () => {
      await saveProvider('whatsapp_meta', form);
      setForm((current) => ({ ...current, token: '', appSecret: '' }));
      return 'Configuração salva. Agora clique em Testar conexão e configure o webhook na Meta.';
    });
  };

  return (
    <form className={styles.panelBody} onSubmit={save}>
      <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.full}`}>
          <span className={styles.label}>Token de acesso permanente</span>
          <input className={styles.input} type="password" autoComplete="new-password" value={form.token} placeholder={hasToken ? '•••••••• salvo — deixe em branco para manter' : 'EAAG...'} onChange={(e) => setForm({ ...form, token: e.target.value })} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>ID do número de telefone</span>
          <input className={styles.input} inputMode="numeric" value={form.phoneId} placeholder="Ex.: 109283746501928" onChange={(e) => setForm({ ...form, phoneId: e.target.value })} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>ID da conta do WhatsApp Business (WABA)</span>
          <input className={styles.input} inputMode="numeric" value={form.wabaId} placeholder="Ex.: 987654321098765" onChange={(e) => setForm({ ...form, wabaId: e.target.value })} />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span className={styles.label}>Chave secreta do app (App Secret)</span>
          <input className={styles.input} type="password" autoComplete="new-password" value={form.appSecret} placeholder={hasSecret ? '•••••••• salva — deixe em branco para manter' : 'Configurações do app > Básico > Chave secreta'} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} />
          <small className={styles.hint}>Valida que as mensagens recebidas vieram mesmo da Meta.</small>
        </label>
      </div>

      {integration && (
        <div className={styles.subCard}>
          <strong>Webhook para cadastrar na Meta</strong>
          <CopyField label="URL de callback" value={`${origin()}/api/webhooks/meta`} />
          <CopyField label="Verificar token" value={String(saved.webhookVerifyToken || '')} hint="No app da Meta: WhatsApp > Configuração > Webhook. Depois assine o campo messages." />
        </div>
      )}

      <FeedbackBox feedback={feedback} />

      <div className={styles.actions}>
        {integration && (
          <button type="button" className={styles.dangerBtn} disabled={busy !== null} onClick={() => confirm('Remover a WhatsApp Business API? As mensagens deixam de chegar por ela.') && run('remove', async () => { await removeProvider('whatsapp_meta'); return 'Integração removida.'; })}>
            <BusyIcon busy={busy === 'remove'} icon={<Trash2 size={16} />} /> Remover
          </button>
        )}
        <span className={styles.spacer} />
        {integration && (
          <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => run('test', () => runTest('whatsapp_meta'))}>
            <BusyIcon busy={busy === 'test'} icon={<Plug size={16} />} /> Testar conexão
          </button>
        )}
        <button type="submit" className={styles.primaryBtn} disabled={busy !== null}>
          <BusyIcon busy={busy === 'save'} icon={<Save size={16} />} /> Salvar
        </button>
      </div>
    </form>
  );
}

// ── Captura de leads ─────────────────────────────────────────

export function LeadCapturePanel({ integration, onChanged }: PanelProps) {
  const { busy, feedback, run } = useActions(onChanged);
  const key = String(integration?.config?.key || '');
  const endpoint = key ? `${origin()}/api/webhooks/leads?key=${key}` : '';

  const generate = (regenerate: boolean) => {
    if (regenerate && !confirm('Gerar uma nova chave? Formulários e automações que usam a chave atual param de funcionar até você atualizar o endereço.')) return;
    run('generate', async () => {
      await saveProvider('lead_capture', { regenerate });
      return regenerate ? 'Nova chave gerada. Atualize o endereço nos seus formulários.' : 'Chave gerada. Use o endereço abaixo no seu formulário.';
    });
  };

  const formExample = `\`\`\`\n<form action="${endpoint}" method="POST">\n  <input name="name" placeholder="Nome" required>\n  <input name="phone" placeholder="WhatsApp">\n  <input name="email" type="email" placeholder="E-mail">\n  <input type="hidden" name="redirect" value="https://seusite.com.br/obrigado">\n  <button type="submit">Quero falar com vocês</button>\n</form>\n\`\`\``;

  return (
    <div className={styles.panelBody}>
      {!key ? (
        <div className={styles.statusCard}>
          <KeyRound size={20} />
          <div>
            <strong>Nenhuma chave ainda</strong>
            <span>Gere a chave para receber leads do seu site, landing page ou automações.</span>
          </div>
        </div>
      ) : (
        <>
          <CopyField label="Endereço de captura (POST)" value={endpoint} hint="Quem tiver este endereço consegue criar leads. Se vazar, gere uma nova chave." />
          <div className={styles.subCard}>
            <strong>Formulário pronto para colar no site</strong>
            <RichText text={formExample} />
          </div>
        </>
      )}

      <FeedbackBox feedback={feedback} />

      <div className={styles.actions}>
        {key && (
          <button type="button" className={styles.dangerBtn} disabled={busy !== null} onClick={() => confirm('Desativar a captura? O endereço para de aceitar leads.') && run('remove', async () => { await removeProvider('lead_capture'); return 'Captura desativada.'; })}>
            <BusyIcon busy={busy === 'remove'} icon={<Trash2 size={16} />} /> Desativar
          </button>
        )}
        <span className={styles.spacer} />
        <button type="button" className={key ? styles.secondaryBtn : styles.primaryBtn} disabled={busy !== null} onClick={() => generate(Boolean(key))}>
          <BusyIcon busy={busy === 'generate'} icon={key ? <RefreshCcw size={16} /> : <KeyRound size={16} />} /> {key ? 'Gerar nova chave' : 'Gerar chave'}
        </button>
      </div>
    </div>
  );
}

// ── Webhooks ─────────────────────────────────────────────────

const EVENTS = [
  { key: 'lead.created', label: 'Lead novo' },
  { key: 'message.received', label: 'Mensagem recebida no WhatsApp' },
];

export function WebhookPanel({ integration, onChanged }: PanelProps) {
  const saved = integration?.config || {};
  const [form, setForm] = useState({
    url: String(saved.url || ''),
    secret: String(saved.secret || ''),
    events: Array.isArray(saved.events) ? (saved.events as string[]) : EVENTS.map((item) => item.key),
    enabled: saved.enabled !== false,
  });
  const { busy, feedback, run } = useActions(onChanged);

  const toggleEvent = (key: string) => setForm((current) => ({
    ...current,
    events: current.events.includes(key) ? current.events.filter((item) => item !== key) : [...current.events, key],
  }));

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    run('save', async () => {
      const result = await saveProvider('webhook_custom', form);
      setForm((current) => ({ ...current, secret: String(result.config.secret || current.secret) }));
      return 'Webhook salvo. Clique em Enviar teste para conferir.';
    });
  };

  return (
    <form className={styles.panelBody} onSubmit={save}>
      <label className={styles.field}>
        <span className={styles.label}>URL que recebe os eventos (https)</span>
        <input className={styles.input} type="url" value={form.url} placeholder="https://hook.us1.make.com/..." onChange={(e) => setForm({ ...form, url: e.target.value })} required />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Eventos</span>
        <div className={styles.checkList}>
          {EVENTS.map((item) => (
            <label key={item.key} className={styles.check}>
              <input type="checkbox" checked={form.events.includes(item.key)} onChange={() => toggleEvent(item.key)} />
              {item.label} <code>{item.key}</code>
            </label>
          ))}
        </div>
      </div>

      {integration ? (
        <CopyField label="Segredo para validar a assinatura" value={form.secret} hint="Cada envio traz X-Vtec-Signature: sha256=HMAC do corpo com este segredo." />
      ) : (
        <p className={styles.hint}>Um segredo para assinar os envios é gerado ao salvar.</p>
      )}

      <label className={styles.check}>
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
        Envios ativos
      </label>

      {integration && <LastDelivery delivery={saved.last_delivery as DeliveryInfo | undefined} />}
      <FeedbackBox feedback={feedback} />

      <div className={styles.actions}>
        {integration && (
          <button type="button" className={styles.dangerBtn} disabled={busy !== null} onClick={() => confirm('Remover o webhook?') && run('remove', async () => { await removeProvider('webhook_custom'); return 'Webhook removido.'; })}>
            <BusyIcon busy={busy === 'remove'} icon={<Trash2 size={16} />} /> Remover
          </button>
        )}
        <span className={styles.spacer} />
        {integration && (
          <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => run('test', () => runTest('webhook_custom'))}>
            <BusyIcon busy={busy === 'test'} icon={<Send size={16} />} /> Enviar teste
          </button>
        )}
        <button type="submit" className={styles.primaryBtn} disabled={busy !== null}>
          <BusyIcon busy={busy === 'save'} icon={<Save size={16} />} /> Salvar
        </button>
      </div>
    </form>
  );
}

// ── Google Sheets ────────────────────────────────────────────

export function SheetsPanel({ integration, onChanged }: PanelProps) {
  const saved = integration?.config || {};
  const [url, setUrl] = useState(String(saved.url || ''));
  const [enabled, setEnabled] = useState(saved.enabled !== false);
  const { busy, feedback, run } = useActions(onChanged);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    run('save', async () => {
      await saveProvider('google_sheets', { url, enabled });
      return 'Planilha conectada. Clique em Enviar teste: uma linha aparece na planilha.';
    });
  };

  return (
    <form className={styles.panelBody} onSubmit={save}>
      <label className={styles.field}>
        <span className={styles.label}>URL do app da Web (Apps Script)</span>
        <input className={styles.input} type="url" value={url} placeholder="https://script.google.com/macros/s/.../exec" onChange={(e) => setUrl(e.target.value)} required />
        <small className={styles.hint}>Siga o Passo a passo: o código para colar no Apps Script está lá, com botão de copiar.</small>
      </label>

      <label className={styles.check}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enviar leads novos para a planilha
      </label>

      {integration && <LastDelivery delivery={saved.last_delivery as DeliveryInfo | undefined} />}
      <FeedbackBox feedback={feedback} />

      <div className={styles.actions}>
        {integration && (
          <button type="button" className={styles.dangerBtn} disabled={busy !== null} onClick={() => confirm('Desconectar a planilha?') && run('remove', async () => { await removeProvider('google_sheets'); return 'Planilha desconectada.'; })}>
            <BusyIcon busy={busy === 'remove'} icon={<Trash2 size={16} />} /> Desconectar
          </button>
        )}
        <span className={styles.spacer} />
        {integration && (
          <button type="button" className={styles.secondaryBtn} disabled={busy !== null} onClick={() => run('test', () => runTest('google_sheets'))}>
            <BusyIcon busy={busy === 'test'} icon={<Send size={16} />} /> Enviar teste
          </button>
        )}
        <button type="submit" className={styles.primaryBtn} disabled={busy !== null}>
          <BusyIcon busy={busy === 'save'} icon={<Save size={16} />} /> Salvar
        </button>
      </div>
    </form>
  );
}

// ── Redes sociais ────────────────────────────────────────────

export function SocialPanel({ overview }: PanelProps) {
  const count = overview.socialAccounts ?? 0;
  return (
    <div className={styles.panelBody}>
      <div className={`${styles.statusCard} ${count > 0 ? styles.statusOk : ''}`}>
        <PlugZap size={20} />
        <div>
          <strong>{count > 0 ? `${count} conta(s) conectada(s)` : 'Nenhuma conta conectada'}</strong>
          <span>A conexão com Instagram e Facebook é feita pelo login do Facebook, em Redes Sociais &gt; Contas.</span>
        </div>
      </div>
      <div className={styles.actions}>
        <span className={styles.spacer} />
        <Link href="/social" className={styles.primaryBtn}><ExternalLink size={16} /> Abrir Redes Sociais</Link>
      </div>
    </div>
  );
}
