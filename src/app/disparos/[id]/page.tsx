"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, Play, Pause, CheckCircle2, XCircle, Clock,
  Loader2, Send, RefreshCw, Megaphone, AlertTriangle, UserCheck, GitBranch
} from "lucide-react";
import styles from "./detail.module.css";

interface Campaign {
  id: string;
  name: string;
  template: string;
  status: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  delay_min: number;
  delay_max: number;
  route_type: string;
  route_to_id: string | null;
  route_to_label: string | null;
  created_at: string;
}

interface Contact {
  id: string;
  phone: string;
  data: Record<string, string>;
  rendered_message: string;
  status: "pending" | "sending" | "sent" | "failed";
  error_msg: string | null;
  sent_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", running: "Enviando", paused: "Pausado",
  completed: "Concluído", failed: "Com Erros",
};

const STATUS_CLASS: Record<string, string> = {
  draft: styles.statusDraft, running: styles.statusRunning, paused: styles.statusPaused,
  completed: styles.statusCompleted, failed: styles.statusFailed,
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function randDelay(min: number, max: number) { return (Math.random() * (max - min) + min) * 1000; }

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const stopRef = useRef(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/disparos/campaigns/${id}`);
    if (!res.ok) { router.push("/disparos"); return; }
    const data = await res.json();
    setCampaign(data.campaign);
    setContacts(data.contacts);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateContactLocally = (contactId: string, patch: Partial<Contact>) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...patch } : c));
  };

  const startSending = async () => {
    if (!campaign) return;
    stopRef.current = false;
    setSending(true);

    await fetch(`/api/disparos/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "running" }),
    });
    setCampaign(prev => prev ? { ...prev, status: "running" } : prev);

    const pending = contacts.filter(c => c.status === "pending");

    for (const contact of pending) {
      if (stopRef.current) break;

      setCurrentContactId(contact.id);
      updateContactLocally(contact.id, { status: "sending" });

      const res = await fetch(`/api/disparos/campaigns/${id}/send-one`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const result = await res.json();

      updateContactLocally(contact.id, {
        status: result.success ? "sent" : "failed",
        error_msg: result.success ? null : (result.error ?? "Erro desconhecido"),
        sent_at: result.success ? new Date().toISOString() : null,
      });

      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          sent_count: prev.sent_count + (result.success ? 1 : 0),
          failed_count: prev.failed_count + (result.success ? 0 : 1),
        };
      });

      if (stopRef.current) break;
      await sleep(randDelay(campaign.delay_min, campaign.delay_max));
    }

    stopRef.current = false;
    setSending(false);
    setCurrentContactId(null);

    const allDone = contacts.every(c => ["sent", "failed"].includes(c.status));
    if (allDone) {
      setCampaign(prev => prev ? { ...prev, status: "completed" } : prev);
    } else {
      await fetch(`/api/disparos/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      setCampaign(prev => prev ? { ...prev, status: "paused" } : prev);
    }
  };

  const stopSending = () => { stopRef.current = true; };

  if (loading) {
    return (
      <div className={styles.loadingCenter}><Loader2 className={styles.spinner} size={40} /></div>
    );
  }
  if (!campaign) return null;

  const pending = contacts.filter(c => c.status === "pending").length;
  const sent = contacts.filter(c => c.status === "sent").length;
  const failed = contacts.filter(c => c.status === "failed").length;
  const total = campaign.total_contacts;
  const progress = total > 0 ? ((sent + failed) / total) * 100 : 0;
  const canStart = ["draft", "paused"].includes(campaign.status) && pending > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/disparos")}>
          <ChevronLeft size={20} /> Voltar
        </button>
        <div className={styles.titleGroup}>
          <div className={styles.titleRow}>
            <Megaphone size={22} />
            <h1>{campaign.name}</h1>
            <span className={`${styles.statusBadge} ${STATUS_CLASS[campaign.status] ?? ""}`}>
              {campaign.status === "running" && <Loader2 size={12} className={styles.spinnerInline} />}
              {STATUS_LABEL[campaign.status] ?? campaign.status}
            </span>
          </div>
          <p className={styles.sub}>
            Delay: {campaign.delay_min}–{campaign.delay_max}s por mensagem
            &nbsp;·&nbsp;
            Criada em {new Date(campaign.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={fetchData} title="Atualizar">
            <RefreshCw size={16} />
          </button>
          {sending ? (
            <button className={styles.stopBtn} onClick={stopSending}>
              <Pause size={16} /> Pausar
            </button>
          ) : (
            <button className={styles.startBtn} onClick={startSending} disabled={!canStart}>
              <Play size={16} />
              {campaign.status === "paused" ? "Retomar" : "Iniciar Disparo"}
            </button>
          )}
        </div>
      </header>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <Clock size={20} />
          <strong>{pending}</strong>
          <span>Pendente</span>
        </div>
        <div className={styles.statCard}>
          <Send size={20} />
          <strong>{sent}</strong>
          <span>Enviado</span>
        </div>
        <div className={`${styles.statCard} ${failed > 0 ? styles.statError : ""}`}>
          <XCircle size={20} />
          <strong>{failed}</strong>
          <span>Falhou</span>
        </div>
        <div className={styles.statCard}>
          <CheckCircle2 size={20} />
          <strong>{total}</strong>
          <span>Total</span>
        </div>
      </div>

      {/* Progress */}
      <div className={styles.progressSection}>
        <div className={styles.progressHeader}>
          <span>Progresso</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressSent} style={{ width: `${total > 0 ? (sent / total) * 100 : 0}%` }} />
          <div className={styles.progressFailed} style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%`, left: `${total > 0 ? (sent / total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Routing + Template */}
      <div className={styles.infoRow}>
        <div className={styles.templateCard}>
          <label>Template da mensagem:</label>
          <p>{campaign.template}</p>
        </div>
        <div className={styles.routingCard}>
          <label>Direcionamento de respostas:</label>
          {campaign.route_type === "none" || !campaign.route_type ? (
            <span className={styles.routeNone}>Sem direcionamento automático</span>
          ) : (
            <div className={styles.routeActive}>
              {campaign.route_type === "user"
                ? <UserCheck size={16} />
                : <GitBranch size={16} />}
              <span>
                {campaign.route_type === "user" ? "Usuário: " : "Etapa: "}
                <strong>{campaign.route_to_label ?? campaign.route_to_id}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Contacts table */}
      <div className={styles.tableSection}>
        <h3>Contatos ({total})</h3>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Telefone</th>
                <th>Mensagem</th>
                <th>Status</th>
                <th>Enviado em</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <motion.tr
                  key={c.id}
                  className={`${styles.row} ${c.id === currentContactId ? styles.rowActive : ""}`}
                  layout
                >
                  <td className={styles.phone}>{c.phone}</td>
                  <td className={styles.msgCell}>{c.rendered_message}</td>
                  <td>
                    <span className={`${styles.contactStatus} ${styles[`cs_${c.status}`]}`}>
                      {c.status === "sending" && <Loader2 size={11} className={styles.spinnerInline} />}
                      {c.status === "pending" && <Clock size={11} />}
                      {c.status === "sent" && <CheckCircle2 size={11} />}
                      {c.status === "failed" && <XCircle size={11} />}
                      {c.status}
                      {c.status === "failed" && c.error_msg && (
                        <span className={styles.errTip} title={c.error_msg}><AlertTriangle size={11} /></span>
                      )}
                    </span>
                  </td>
                  <td className={styles.sentAt}>
                    {c.sent_at ? new Date(c.sent_at).toLocaleTimeString("pt-BR") : "—"}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
