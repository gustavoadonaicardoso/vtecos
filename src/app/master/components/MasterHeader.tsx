import { CheckCircle2, Plus, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import styles from '../master.module.css';
import type { TabId } from '../types';

interface MasterHeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  saved: boolean;
  bannerSaved: boolean;
  onSave: () => void;
  onReset: () => void;
  onAddBanner: () => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'modules', label: 'Módulo de Comando' },
  { id: 'branding', label: 'Identidade Visual' },
  { id: 'permissions', label: 'Gestão de Menu' },
  { id: 'tenants', label: 'Múltiplas Empresas' },
  { id: 'banners', label: 'Banners' },
];

export default function MasterHeader({ activeTab, onTabChange, saved, bannerSaved, onSave, onReset, onAddBanner }: MasterHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <div className={styles.headerIcon}>
          <ShieldCheck size={28} />
        </div>
        <div>
          <h1>Painel Master</h1>
          <p>Controle total sobre a infraestrutura e identidade do sistema.</p>
        </div>
      </div>

      <div className={styles.tabNav}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.headerActions}>
        {(activeTab === 'branding' || activeTab === 'permissions') && (
          <div className={styles.actionButtons}>
            {activeTab === 'branding' && (
              <button className={styles.resetBtn} onClick={onReset}>
                <RotateCcw size={16} /> Padrões
              </button>
            )}
            <button
              className={`${styles.saveBtn} ${saved ? styles.saveBtnSuccess : ''}`}
              onClick={onSave}
            >
              {saved ? <><CheckCircle2 size={16} /> Salvo!</> : <><Save size={16} /> {activeTab === 'permissions' ? 'Salvar e Aplicar' : 'Salvar'}</>}
            </button>
          </div>
        )}
        {activeTab === 'banners' && (
          <div className={styles.actionButtons}>
            {bannerSaved && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700, fontSize: '0.9rem' }}>
                <CheckCircle2 size={16} /> Salvo!
              </span>
            )}
            <button className={styles.saveBtn} onClick={onAddBanner}>
              <Plus size={16} /> Novo Banner
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
