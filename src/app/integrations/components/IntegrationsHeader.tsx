import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import styles from '../integrations.module.css';
import { CATEGORIES } from '../constants';

interface IntegrationsHeaderProps {
  connectedCount: number;
  searchQuery: string;
  filter: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: string) => void;
}

export default function IntegrationsHeader({
  connectedCount,
  searchQuery,
  filter,
  onSearchChange,
  onFilterChange,
}: IntegrationsHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h2 className={styles.title}>Centro de Integrações</h2>
          <p className={styles.subtitle}>Potencialize seu CRM Vórtice com as plataformas oficiais de vendas.</p>
        </motion.div>

        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{connectedCount}</span>
            <span className={styles.statLabel}>Conectado(s)</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>5</span>
            <span className={styles.statLabel}>Disponíveis</span>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.searchWrapper}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            name="integration-search"
            autoComplete="off"
            placeholder="Buscar integrações..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className={styles.filterList}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`${styles.filterBtn} ${filter === cat ? styles.filterBtnActive : ''}`}
              onClick={() => onFilterChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
