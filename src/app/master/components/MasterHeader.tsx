import { useEffect, useRef } from 'react';
import { Building2, CheckCircle2, Layout, LayoutGrid, LifeBuoy, Loader2, Palette, Plus, RotateCcw, Save, ServerCog, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import styles from '../master.module.css';
import type { TabId } from '../types';

interface MasterHeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  saved: boolean;
  saving: boolean;
  bannerSaved: boolean;
  onSave: () => void;
  onReset: () => void;
  onAddBanner: () => void;
}

const TABS: { id: TabId; label: string; icon: typeof Layout }[] = [
  { id: 'modules', label: 'Módulo de Comando', icon: LayoutGrid },
  { id: 'tenants', label: 'Empresas e Planos', icon: Building2 },
  { id: 'branding', label: 'Identidade Visual', icon: Palette },
  { id: 'permissions', label: 'Menu por Função', icon: SlidersHorizontal },
  { id: 'banners', label: 'Banners', icon: Layout },
  { id: 'platform', label: 'Plataforma', icon: ServerCog },
  { id: 'help', label: 'Ajuda', icon: LifeBuoy },
];

export default function MasterHeader({ activeTab, onTabChange, saved, saving, bannerSaved, onSave, onReset, onAddBanner }: MasterHeaderProps) {
  const savable = activeTab === 'branding' || activeTab === 'permissions';
  const navRef = useRef<HTMLElement>(null);

  // Em telas estreitas as abas rolam: mantém a aba ativa à vista.
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1>Painel Master</h1>
            <p>Empresas, planos e a identidade do sistema em um só lugar.</p>
          </div>
        </div>

        {savable && (
          <div className={styles.actionButtons}>
            {activeTab === 'branding' && (
              <button className={styles.resetBtn} onClick={onReset} disabled={saving}>
                <RotateCcw size={16} /> Restaurar padrão
              </button>
            )}
            <button
              className={`${styles.saveBtn} ${saved ? styles.saveBtnSuccess : ''}`}
              onClick={onSave}
              disabled={saving}
            >
              {saving ? <Loader2 size={16} className={styles.spin} />
                : saved ? <CheckCircle2 size={16} />
                : <Save size={16} />}
              {saved ? 'Salvo!' : activeTab === 'permissions' ? 'Aplicar à equipe' : 'Salvar'}
            </button>
          </div>
        )}
        {activeTab === 'banners' && (
          <div className={styles.actionButtons}>
            {bannerSaved && (
              <span className={styles.savedTag}>
                <CheckCircle2 size={16} /> Salvo!
              </span>
            )}
            <button className={styles.saveBtn} onClick={onAddBanner}>
              <Plus size={16} /> Novo banner
            </button>
          </div>
        )}
      </div>

      <nav ref={navRef} className={styles.tabNav} aria-label="Seções do Painel Master">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`${styles.tabBtn} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => onTabChange(id)}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
