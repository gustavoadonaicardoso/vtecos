import { AlertTriangle, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface SendErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export default function SendErrorBanner({ message, onDismiss }: SendErrorBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      style={{
        margin: '0 1rem 0.5rem',
        padding: '10px 14px',
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '10px',
        color: '#ef4444',
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}
    >
      <AlertTriangle size={15} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
