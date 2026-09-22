import { Plus, Users, LayoutDashboard } from 'lucide-react';
import styles from '../users.module.css';

interface UserPersonalizationTabProps {
  primaryColor: string;
  secondaryColor: string;
  appName: string;
  logoUrl: string;
  faviconUrl: string;
  loading: boolean;
  onPrimaryColorChange: (value: string) => void;
  onSecondaryColorChange: (value: string) => void;
  onAppNameChange: (value: string) => void;
  onLogoUrlChange: (value: string) => void;
  onFaviconUrlChange: (value: string) => void;
  onFileSelect: (type: 'logo' | 'favicon', e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveBranding: () => void;
}

export default function UserPersonalizationTab({
  primaryColor,
  secondaryColor,
  appName,
  logoUrl,
  faviconUrl,
  loading,
  onPrimaryColorChange,
  onSecondaryColorChange,
  onAppNameChange,
  onLogoUrlChange,
  onFaviconUrlChange,
  onFileSelect,
  onSaveBranding,
}: UserPersonalizationTabProps) {
  return (
    <div className={styles.personalizationSection}>
      <div className={styles.brandingHeader}>
        <h4>Identidade Visual e Marca</h4>
        <p>Personalize as cores e logotipos de todo o sistema sem precisar de código.</p>
      </div>

      <div className={styles.brandingGrid}>
        <div className={styles.formGroup}>
          <label>Cor Primária</label>
          <div className={styles.colorRow}>
            <input type="color" value={primaryColor} onChange={e => onPrimaryColorChange(e.target.value)} />
            <input type="text" value={primaryColor} onChange={e => onPrimaryColorChange(e.target.value)} />
          </div>
        </div>
        <div className={styles.formGroup}>
          <label>Cor Secundária</label>
          <div className={styles.colorRow}>
            <input type="color" value={secondaryColor} onChange={e => onSecondaryColorChange(e.target.value)} />
            <input type="text" value={secondaryColor} onChange={e => onSecondaryColorChange(e.target.value)} />
          </div>
        </div>
        <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
          <label>Nome do Aplicativo (Título do Site)</label>
          <input className={styles.input} value={appName} onChange={e => onAppNameChange(e.target.value)} placeholder="Vórtice CRM" />
        </div>

        <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
          <label>Logotipo do CRM</label>
          <div className={styles.fileInputRow}>
            <button className={styles.fileSelectBtn} onClick={() => document.getElementById('logo-upload')?.click()}>
              <Plus size={16} /> Selecionar Arquivo
            </button>
            <input className={styles.input} value={logoUrl} onChange={e => onLogoUrlChange(e.target.value)} placeholder="Ou cole a URL da imagem aqui" />
            <input id="logo-upload" type="file" accept="image/*" hidden onChange={(e) => onFileSelect('logo', e)} />
          </div>
          <span className={styles.idealSizeHint}>Tamanho ideal: 400x120px (Proporção horizontal)</span>
        </div>

        <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
          <label>Favicon (Ícone do Navegador)</label>
          <div className={styles.fileInputRow}>
            <button className={styles.fileSelectBtn} onClick={() => document.getElementById('favicon-upload')?.click()}>
              <Plus size={16} /> Selecionar Arquivo
            </button>
            <input className={styles.input} value={faviconUrl} onChange={e => onFaviconUrlChange(e.target.value)} placeholder="Ou cole a URL do favicon aqui" />
            <input id="favicon-upload" type="file" accept="image/*" hidden onChange={(e) => onFileSelect('favicon', e)} />
          </div>
          <span className={styles.idealSizeHint}>Tamanho ideal: 32x32px ou 64x64px (.png ou .ico)</span>
        </div>
      </div>

      <div className={styles.brandingPreview}>
        <div className={styles.brandingHeaderSmall}>
          <LayoutDashboard size={18} color="#3b82f6" />
          <h5>Logo & Favicon Preview</h5>
        </div>

        <div className={styles.previewBox}>
          <div className={styles.logoPreviewArea}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Preview Logo"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            ) : (
              <div className={styles.emptyState}>
                <Users size={32} />
                <span>Logotipo não definido</span>
              </div>
            )}
          </div>

          <div className={styles.faviconPreviewArea}>
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt="Preview Favicon"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            ) : (
              <div className={styles.emptyFavicon}>
                <LayoutDashboard size={14} />
              </div>
            )}
            <span>Favicon</span>
          </div>
        </div>
      </div>

      <div className={styles.brandingInstructions}>
        <p><strong>Dica de Host:</strong> Para usar imagens personalizadas, você pode fazer upload em serviços como Imgur, Cloudinary ou no próprio Supabase Storage e colar o link público aqui.</p>
      </div>

      <button className={styles.saveBrandingBtn} onClick={onSaveBranding} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar Alterações de Marca'}
      </button>
    </div>
  );
}
