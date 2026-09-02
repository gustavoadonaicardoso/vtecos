"use client";

import React from "react";
import { motion } from "framer-motion";
import { BarChart2, Database, Info, TableProperties } from "lucide-react";
import styles from "./relatorios.module.css";

type EmptyReportCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
};

function EmptyReportCard({ icon, title, description }: EmptyReportCardProps) {
  return (
    <article className={styles.emptyReportCard}>
      <div className={styles.emptyReportHeader}>
        <div className={styles.emptyReportIcon}>{icon}</div>
        <span className={styles.emptyReportBadge}>
          <Info size={12} />
          Sem dados
        </span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </article>
  );
}

export default function RelatoriosPage() {
  return (
    <div className={styles.pageWrapper}>
      <div className={styles.filterBar}>
        <div className={styles.dataSourceStatus} role="status">
          <div className={styles.dataSourceIcon}>
            <Database size={17} />
          </div>
          <div className={styles.dataSourceCopy}>
            <strong>Dados não disponíveis</strong>
            <span>Nenhum banco de dados, planilha ou integração está conectado.</span>
          </div>
        </div>
      </div>

      <motion.main
        className={styles.content}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <section className={styles.emptyStateSection} aria-labelledby="reports-empty-title">
          <div className={styles.emptyStateIcon}>
            <Database size={32} />
          </div>
          <h1 id="reports-empty-title">Relatórios aguardando dados</h1>
          <p>
            Os indicadores e gráficos aparecerão aqui quando uma fonte de dados for conectada.
            Nenhum valor fictício é exibido enquanto não houver registros reais.
          </p>
        </section>

        <div className={styles.emptyReportGrid}>
          <EmptyReportCard
            icon={<TableProperties size={18} />}
            title="Indicadores por Unidade"
            description="Tabelas de vendas, qualidade, descontos e saldo serão exibidas após a conexão da fonte."
          />
          <EmptyReportCard
            icon={<BarChart2 size={18} />}
            title="Análise Gráfica"
            description="Comparativos e gráficos serão gerados somente a partir de dados disponíveis."
          />
        </div>
      </motion.main>
    </div>
  );
}
