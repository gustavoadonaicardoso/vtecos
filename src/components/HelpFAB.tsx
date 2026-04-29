"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from './HelpFAB.module.css';

const HelpFAB = () => {
  const pathname = usePathname();

  if (pathname === '/messages') return null;

  return (
    <motion.div 
      className={styles.fabContainer}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 1 }}
    >
      <Link href="/help" className={styles.fab} title="Central de Ajuda">
        <div className={styles.pulse}></div>
        <LifeBuoy size={24} />
      </Link>
    </motion.div>
  );
};

export default HelpFAB;
