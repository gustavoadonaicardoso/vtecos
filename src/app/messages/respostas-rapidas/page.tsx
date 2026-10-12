'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Edit2, Loader2, Plus, Search, Trash2, X, Zap } from 'lucide-react';
import styles from './respostas.module.css';
import { useAuth } from '@/context/AuthContext';
import { fillTemplate } from '../format';
import type { Lead } from '@/types';
import {
  QUICK_REPLY_CONTENT_MAX,
  QUICK_REPLY_NAME_MAX,
  SHORTCUT_MAX,
  matchQuickReplies,
  normalizeShortcut,
  suggestShortcut,
  type QuickReplyItem,
} from '@/lib/quick-replies';

interface Draft {
  id: string | null;
  name: string;
  shortcut: string;
  /** O atalho foi digitado à mão (não segue mais o nome). */
  shortcutTouched: boolean;
  content: string;
}

const VARIABLES: { token: string; label: string }[] = [
  { token: '{{primeiro_nome}}', label: 'Primeiro nome' },
  { token: '{{nome}}', label: 'Nome completo' },
  { token: '{{atendente}}', label: 'Seu nome' },
  { token: '{{email_acesso}}', label: 'E-mail de acesso' },
  { token: '{{senha_acesso}}', label: 'Senha de acesso' },
  { token: '{{link_acesso}}', label: 'Link de acesso' },
  { token: '{{saudacao}}', label: 'Bom dia / Boa tarde' },
];

/** Lead de exemplo da prévia (a senha aparece como ••••••). */
const PREVIEW_LEAD = {
  id: 'exemplo', name: 'Maria Souza', email: 'maria@email.com', phone: '', cpfCnpj: '', tags: [], pipelineStage: '', entryDate: '', status: 'Ativo', color: '', channels: [], lastMsg: '',
  extra: { accessEmail: 'maria.aluna@escola.com', accessUrl: 'https://portal.exemplo.com', accessLogin: 'maria.souza' },
} as Lead;

/** Pontos de partida para quem ainda não tem nenhuma resposta. */
const EXAMPLES: { name: string; shortcut: string; content: string }[] = [
  { name: 'Boas-vindas', shortcut: 'oi', content: 'Olá, {{primeiro_nome}}! Aqui é {{atendente}}. Como posso ajudar você hoje?' },
  { name: 'Horário de atendimento', shortcut: 'horario', content: 'Nosso atendimento é de segunda a sexta, das [__h] às [__h].' },
  { name: 'Endereço', shortcut: 'endereco', content: 'Estamos em [endereço completo]. Quer que eu mande a localização?' },
  { name: 'Agradecimento', shortcut: 'obrigado', content: 'Obrigado pelo contato, {{primeiro_nome}}! Qualquer dúvida, é só chamar por aqui.' },
  { name: 'Dados de acesso', shortcut: 'acesso', content: '{{saudacao}}, {{primeiro_nome}}! Seu acesso está liberado:\n\nLink: {{link_acesso}}\nE-mail: {{email_acesso}}\nSenha: {{senha_acesso}}\n\nQualquer dúvida, é só chamar por aqui.' },
];

const emptyDraft = (): Draft => ({ id: null, name: '', shortcut: '', shortcutTouched: false, content: '' });

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  return response.ok ? null : (json.error as string) || 'Não foi possível salvar.';
}

export default function QuickRepliesPage() {
  const { user } = useAuth();
  const agent = user?.name?.split(' ')[0] || 'Ana';
  const [replies, setReplies] = useState<QuickReplyItem[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/messages/templates?all=1', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(json.error || 'Não foi possível carregar as respostas rápidas.');
      setReplies([]);
      return;
    }
    setReplies(json.templates || []);
    setCanManage(Boolean(json.canManage));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visible = useMemo(() => {
    const list = replies || [];
    if (!query.trim()) return list;
    const text = query.trim().toLowerCase();
    const byShortcut = matchQuickReplies(list, query, list.length);
    const byContent = list.filter((item) => !byShortcut.includes(item) && item.content.toLowerCase().includes(text));
    return [...byShortcut, ...byContent];
  }, [replies, query]);

  const shortcutOwner = useMemo(() => {
    const shortcut = draft ? normalizeShortcut(draft.shortcut) : '';
    if (!shortcut) return null;
    return (replies || []).find((item) => item.shortcut === shortcut && item.id !== draft?.id) || null;
  }, [draft, replies]);

  const startEdit = (reply: QuickReplyItem) => {
    setError('');
    setDraft({ id: reply.id, name: reply.name, shortcut: reply.shortcut || '', shortcutTouched: Boolean(reply.shortcut), content: reply.content });
  };

  const startNew = (example?: (typeof EXAMPLES)[number]) => {
    setError('');
    setDraft(example ? { id: null, name: example.name, shortcut: example.shortcut, shortcutTouched: true, content: example.content } : emptyDraft());
  };

  const insertVariable = (token: string) => {
    if (!draft) return;
    const el = contentRef.current;
    const from = el ? el.selectionStart : draft.content.length;
    const to = el ? el.selectionEnd : draft.content.length;
    const next = (draft.content.slice(0, from) + token + draft.content.slice(to)).slice(0, QUICK_REPLY_CONTENT_MAX);
    setDraft({ ...draft, content: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from + token.length, from + token.length);
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.content.trim()) {
      setError('Dê um nome e escreva a mensagem.');
      return;
    }
    if (shortcutOwner) {
      setError(`O atalho /${draft.shortcut} já é usado em "${shortcutOwner.name}". Escolha outro.`);
      return;
    }
    setBusy(true);
    setError('');
    const body = { name: draft.name.trim(), content: draft.content.trim(), shortcut: normalizeShortcut(draft.shortcut) || null };
    const failure = draft.id ? await call(`/api/messages/templates/${draft.id}`, 'PATCH', body) : await call('/api/messages/templates', 'POST', body);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setNotice(draft.id ? 'Resposta rápida salva.' : 'Resposta rápida criada.');
    setDraft(null);
    await load();
  };

  const remove = async (reply: QuickReplyItem) => {
    if (!confirm(`Apagar a resposta rápida "${reply.name}"?`)) return;
    setBusy(true);
    const failure = await call(`/api/messages/templates/${reply.id}`, 'DELETE');
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (draft?.id === reply.id) setDraft(null);
    setNotice('Resposta rápida apagada.');
    await load();
  };

  const previewName = 'Maria Souza';
  const preview = draft ? fillTemplate(draft.content, { name: previewName, agent, lead: PREVIEW_LEAD }) : '';

  return (
    <div className={styles.page}>
      <Link href="/messages" className={styles.back}><ArrowLeft size={15} /> Voltar para as conversas</Link>

      <div className={styles.header}>
        <div>
          <h1><Zap size={26} /> Respostas rápidas</h1>
          <p>
            Mensagens prontas para o atendimento. Na conversa, digite <code>/</code> e o atalho (por exemplo <code>/oi</code>)
            ou clique no raio ao lado do campo de mensagem.
          </p>
        </div>
        {canManage && (
          <button type="button" className={styles.primaryBtn} onClick={() => startNew()}>
            <Plus size={16} /> Nova resposta
          </button>
        )}
      </div>

      {notice && <div className={styles.okBox} role="status"><CheckCircle2 size={16} /> {notice}</div>}
      {error && !draft && <div className={styles.errorBox} role="alert"><AlertTriangle size={16} /> {error}</div>}

      <div className={`${styles.layout} ${draft ? '' : styles.layoutSingle}`}>
        <section className={styles.card} aria-label="Lista de respostas rápidas">
          <label className={styles.search}>
            <Search size={15} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por atalho, nome ou texto" aria-label="Buscar resposta rápida" />
          </label>

          {replies === null ? (
            <p className={styles.muted}><Loader2 size={15} className={styles.spin} /> Carregando…</p>
          ) : replies.length === 0 ? (
            <div className={styles.empty}>
              <Zap size={32} />
              <h3>Nenhuma resposta rápida ainda</h3>
              {canManage ? (
                <>
                  <p>Crie as mensagens que a equipe mais repete. Comece por um destes exemplos e ajuste o texto:</p>
                  <div className={styles.examples}>
                    {EXAMPLES.map((example) => (
                      <button key={example.shortcut} type="button" className={styles.example} onClick={() => startNew(example)}>/{example.shortcut} · {example.name}</button>
                    ))}
                  </div>
                </>
              ) : (
                <p>Peça para um administrador ou gerente criar as respostas rápidas da empresa.</p>
              )}
            </div>
          ) : visible.length === 0 ? (
            <p className={styles.muted}>Nada encontrado para “{query}”.</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((reply) => (
                <li key={reply.id} className={`${styles.item} ${draft?.id === reply.id ? styles.itemOn : ''}`}>
                  <div className={styles.itemBody}>
                    <div className={styles.itemTitle}>
                      {reply.shortcut ? <code className={styles.shortcut}>/{reply.shortcut}</code> : <span className={styles.noShortcut}>sem atalho</span>}
                      <strong>{reply.name}</strong>
                    </div>
                    <p className={styles.itemText}>{reply.content}</p>
                  </div>
                  {canManage && (
                    <div className={styles.itemActions}>
                      <button type="button" className={styles.iconBtn} onClick={() => startEdit(reply)} aria-label={`Editar ${reply.name}`} title="Editar"><Edit2 size={15} /></button>
                      <button type="button" className={styles.iconBtn} onClick={() => remove(reply)} disabled={busy} aria-label={`Apagar ${reply.name}`} title="Apagar"><Trash2 size={15} /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className={styles.tip}>
            {canManage
              ? <>Todas as respostas valem para a equipe inteira. Para liberar só algumas para uma pessoa, use Equipe &gt; Acessos.</>
              : <>Só administradores e gerentes criam e editam respostas rápidas.</>}
          </p>
        </section>

        {draft && canManage && (
          <section className={`${styles.card} ${styles.editor}`} aria-label={draft.id ? 'Editar resposta rápida' : 'Nova resposta rápida'}>
            <div className={styles.cardHead}>
              <h2>{draft.id ? 'Editar resposta' : 'Nova resposta'}</h2>
              <button type="button" className={styles.iconBtn} onClick={() => { setDraft(null); setError(''); }} aria-label="Fechar"><X size={17} /></button>
            </div>
            <div className={styles.form}>
              <label className={styles.field}>
                <span>Nome <small>{draft.name.length}/{QUICK_REPLY_NAME_MAX}</small></span>
                <input
                  className={styles.input}
                  value={draft.name}
                  maxLength={QUICK_REPLY_NAME_MAX}
                  autoFocus
                  placeholder="Ex.: Boas-vindas"
                  onChange={(e) => {
                    const name = e.target.value;
                    setDraft({ ...draft, name, shortcut: draft.shortcutTouched ? draft.shortcut : suggestShortcut(name) });
                  }}
                />
              </label>

              <label className={styles.field}>
                <span>Atalho</span>
                <div className={styles.slashInput}>
                  <b>/</b>
                  <input
                    value={draft.shortcut}
                    maxLength={SHORTCUT_MAX}
                    placeholder="boasvindas"
                    aria-label="Atalho"
                    onChange={(e) => setDraft({ ...draft, shortcut: normalizeShortcut(e.target.value, true), shortcutTouched: true })}
                  />
                </div>
                <small className={styles.hint}>
                  {shortcutOwner
                    ? <span style={{ color: 'var(--bad)' }}>Já usado em “{shortcutOwner.name}”.</span>
                    : draft.shortcut
                      ? <>Na conversa, digite <code>/{draft.shortcut}</code> e aperte Enter.</>
                      : 'Opcional. Letras, números, - e _, sem espaço.'}
                </small>
              </label>

              <label className={styles.field}>
                <span>Mensagem <small>{draft.content.length}/{QUICK_REPLY_CONTENT_MAX}</small></span>
                <textarea
                  ref={contentRef}
                  className={styles.input}
                  rows={6}
                  maxLength={QUICK_REPLY_CONTENT_MAX}
                  value={draft.content}
                  placeholder="Olá, {{primeiro_nome}}! Aqui é {{atendente}}…"
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                />
              </label>
              <div className={styles.field}>
                <span>Inserir no texto</span>
                <div className={styles.vars}>
                  {VARIABLES.map((variable) => (
                    <button key={variable.token} type="button" className={styles.varBtn} onClick={() => insertVariable(variable.token)}>{variable.label}</button>
                  ))}
                </div>
              </div>

              <div className={styles.preview} aria-live="polite">
                <span>Prévia (conversa com {previewName})</span>
                <div className={styles.bubble}>{preview || 'A mensagem aparece aqui.'}</div>
              </div>

              {error && <div className={styles.errorBox} role="alert"><AlertTriangle size={16} /> {error}</div>}

              <div className={styles.actions}>
                {draft.id && (
                  <button type="button" className={styles.dangerBtn} onClick={() => { const reply = replies?.find((item) => item.id === draft.id); if (reply) void remove(reply); }} disabled={busy}>
                    <Trash2 size={15} /> Apagar
                  </button>
                )}
                <div>
                  <button type="button" className={styles.secondaryBtn} onClick={() => { setDraft(null); setError(''); }}>Cancelar</button>
                  <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy || Boolean(shortcutOwner)}>
                    {busy && <Loader2 size={15} className={styles.spin} />} Salvar
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
