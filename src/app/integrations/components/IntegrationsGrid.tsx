import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, ArrowUpRight } from 'lucide-react';
import styles from '../integrations.module.css';

interface IntegrationItem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  category: string;
  status: string;
  color: string;
}

interface IntegrationsGridProps {
  items: IntegrationItem[];
  onOpenModal: (id: string) => void;
}

export default function IntegrationsGrid({ items, onOpenModal }: IntegrationsGridProps) {
  return (
    <motion.div className={styles.grid} layout>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.05 }}
            className={styles.card}
          >
            <div className={styles.cardHeader}>
              <div
                className={styles.iconBox}
                style={{ background: `${item.color}15`, color: item.color }}
              >
                <item.icon size={24} />
              </div>
              <div className={styles.statusBadge}>
                {item.status === 'connected' && (
                  <span className={styles.activeLabel}>
                    <CheckCircle2 size={12} /> Conectado
                  </span>
                )}
                {item.status === 'pending' && (
                  <span className={styles.pendingLabel}>
                    <Clock size={12} /> Pendente
                  </span>
                )}
              </div>
            </div>

            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>{item.name}</h3>
              <p className={styles.cardDesc}>{item.description}</p>
              <div className={styles.categoryTag}>{item.category}</div>
            </div>

            <div className={styles.cardFooter}>
              <button
                className={`${item.status === 'connected' ? styles.configureBtn : styles.connectBtn}`}
                onClick={() => onOpenModal(item.id)}
              >
                {item.status === 'connected' ? 'Configurar Instância' : 'Conectar Agora'}
                {item.status !== 'connected' && <ArrowUpRight size={16} />}
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
