import React from 'react';
import { Building2, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import styles from '../master.module.css';
import type { Tenant } from '../types';

interface TenantsTabProps {
  tenants: Tenant[];
  newTenantName: string;
  onNewTenantNameChange: (value: string) => void;
  onCreateTenant: (e: React.FormEvent) => void;
  loading: boolean;
}

export default function TenantsTab({ tenants, newTenantName, onNewTenantNameChange, onCreateTenant, loading }: TenantsTabProps) {
  return (
    <motion.div
      key="tenants"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={styles.grid}
    >
      <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
        <div className={styles.cardHeader}>
          <Building2 size={20} />
          <h2>Gestão de Empresas (Multi-Tenant)</h2>
        </div>
        <p style={{ opacity: 0.7, marginBottom: '20px', fontSize: '0.9rem' }}>
          Crie e gerencie ambientes isolados para diferentes clientes (empresas).
          Cada empresa criada ganha sua própria base de Leads, Configurações e Pipeline.
        </p>

        <form onSubmit={onCreateTenant} style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
          <input
            type="text"
            value={newTenantName}
            onChange={(e) => onNewTenantNameChange(e.target.value)}
            placeholder="Nome do novo Tenant (Empresa)"
            className={styles.input}
            style={{ flex: 1 }}
            required
          />
          <button type="submit" className={styles.saveBtn} disabled={loading} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Plus size={18} /> Criar Empresa
          </button>
        </form>

        <div className={styles.tableWrapper}>
          <table className={styles.performanceTable}>
            <thead>
              <tr>
                <th>ID da Empresa</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Criado Em</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td style={{ opacity: 0.6, fontSize: '0.8rem' }}>{t.id}</td>
                  <td><strong>{t.name}</strong></td>
                  <td>
                    <span className={styles.statusBadge} style={{ background: t.status === 'ACTIVE' ? '#10b98120' : '#ef444420', color: t.status === 'ACTIVE' ? '#10b981' : '#ef4444' }}>
                      {t.status}
                    </span>
                  </td>
                  <td>{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>Nenhuma empresa encontrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
