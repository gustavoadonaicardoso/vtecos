import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import { MASTER_MODULES } from '../constants';

export default function ModulesTab() {
  const router = useRouter();

  return (
    <motion.div
      key="modules"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={styles.modulesGrid}
    >
      {MASTER_MODULES.map(mod => (
        <div
          key={mod.id}
          className={styles.moduleCard}
          onClick={() => router.push(mod.path)}
        >
          <div className={styles.cardHeaderSmall}>
            <div className={styles.iconBox} style={{ color: mod.color, background: `${mod.color}15` }}>
              <mod.icon size={22} />
            </div>
            <ChevronRight size={18} className={styles.arrowIcon} />
          </div>
          <div className={styles.cardBodySmall}>
            <h3>{mod.title}</h3>
            <p>{mod.desc}</p>
          </div>
        </div>
      ))}
    </motion.div>
  );
}
