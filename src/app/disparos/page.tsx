"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Plus, Trash2, Eye, CheckCircle2, XCircle, Clock,
  Loader2, Megaphone, AlertTriangle
} from "lucide-react";
import styles from "./disparos.module.css";

interface Campaign {
  id: string;
  name: string;
  template: string;
  status: "draft" | "running" | "paused" | "completed" | "failed";
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  delay_min: number;
  delay_max: number;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  running: "Enviando",
  paused: "Pausado",
  completed: "Concluído",
  failed: "Com Erros",
};

const STATUS_CLASS: Record<string, string> = {
  draft: styles.statusDraft,
  running: styles.statusRunning,
  paused: styles.statusPaused,
  completed: styles.statusCompleted,
  failed: styles.statusFailed,
};

export default function DisparosPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/disparos/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Excluir campanha "${name}"?`)) return;
    setDeleting(id);
    await fetch(`/api/disparos/campaigns/${id}`, { method: "DELETE" });
    setCampaigns(prev => prev.filter(c => c.id !== id));
    setDeleting(null);
  };

  const pending = (c: Campaign) => c.total_contacts - c.sent_count - c.failed_count;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <h1><Megaphone size={28} /> Disparos em Massa</h1>
          <p>Envie mensagens personalizadas para listas de contatos via WhatsApp.</p>
        </div>
        <Link href="/disparos/nova" className={styles.newBtn}>
          <Plus size={18} /> Nova Campanha
        </Link>
      </header>

      {loading ? (
        <div className={styles.loadingCenter}><Loader2 className={styles.spinner} size={36} /></div>
      ) : campaigns.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={styles.emptyState}>
          <Send size={52} />
          <h2>Nenhuma campanha ainda</h2>
          <p>Crie sua primeira campanha de disparo em massa importando uma planilha CSV ou Excel.</p>
          <Link href="/disparos/nova" className={styles.newBtn}><Plus size={18} /> Criar Campanha</Link>
        </motion.div>
      ) : (
        <div className={styles.grid}>
          <AnimatePresence>
            {campaigns.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                className={styles.card}
              >
                <div className={styles.cardTop}>
                  <div>
                    <h3>{c.name}</h3>
                    <p className={styles.templatePreview}>{c.template.slice(0, 80)}{c.template.length > 80 ? "…" : ""}</p>
                  </div>
                  <span className={`${styles.statusBadge} ${STATUS_CLASS[c.status] ?? ""}`}>
                    {c.status === "running" && <Loader2 size={12} className={styles.spinnerInline} />}
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>

                <div className={styles.progressWrap}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: c.total_contacts > 0 ? `${((c.sent_count + c.failed_count) / c.total_contacts) * 100}%` : "0%" }}
                    />
                    <div
                      className={styles.progressFailed}
                      style={{
                        width: c.total_contacts > 0 ? `${(c.failed_count / c.total_contacts) * 100}%` : "0%",
                        left: c.total_contacts > 0 ? `${(c.sent_count / c.total_contacts) * 100}%` : "0%",
                      }}
                    />
                  </div>
                  <span className={styles.progressLabel}>
                    {c.sent_count + c.failed_count}/{c.total_contacts}
                  </span>
                </div>

                <div className={styles.stats}>
                  <div className={styles.stat}>
                    <Clock size={14} />
                    <span>{pending(c)}</span>
                    <label>Pendente</label>
                  </div>
                  <div className={styles.stat}>
                    <CheckCircle2 size={14} />
                    <span>{c.sent_count}</span>
                    <label>Enviado</label>
                  </div>
                  <div className={`${styles.stat} ${c.failed_count > 0 ? styles.statError : ""}`}>
                    <XCircle size={14} />
                    <span>{c.failed_count}</span>
                    <label>Falhou</label>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <span className={styles.dateLabel}>{new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                  <div className={styles.actionBtns}>
                    <Link href={`/disparos/${c.id}`} className={styles.viewBtn}><Eye size={16} /> Ver</Link>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(c.id, c.name)}
                      disabled={deleting === c.id}
                    >
                      {deleting === c.id ? <Loader2 size={14} className={styles.spinner} /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
