"use client";

import React, { useState } from 'react';
import { Save } from 'lucide-react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import type { SocialAccount, SocialSettings } from '@/types';

interface SettingsPanelProps {
  settings: SocialSettings;
  accounts: SocialAccount[];
  isAdmin: boolean;
  onSaved: (settings: SocialSettings) => void;
}

export default function SettingsPanel({ settings, accounts, isAdmin, onSaved }: SettingsPanelProps) {
  const [draft, setDraft] = useState<SocialSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const toggleDefaultAccount = (id: string) => {
    setDraft((current) => ({
      ...current,
      defaultAccountIds: current.defaultAccountIds.includes(id)
        ? current.defaultAccountIds.filter((value) => value !== id)
        : [...current.defaultAccountIds, id],
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/social/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ type: 'error', text: result.error || 'Não foi possível salvar.' });
        return;
      }
      onSaved(result.data);
      setDraft(result.data);
      setMessage({ type: 'success', text: 'Configurações salvas.' });
    } catch {
      setMessage({ type: 'error', text: 'Falha de conexão.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.panel}>
      {!isAdmin && (
        <div className={`${styles.banner} ${styles.bannerInfo}`} style={{ marginBottom: 8 }}>
          Só administradores alteram estas configurações.
        </div>
      )}

      <div className={styles.settingRow}>
        <div>
          <strong>Exigir aprovação para vendedores</strong>
          <p>
            Quando ligado, posts criados por vendedores vão para “Aguardando aprovação” e só saem depois que um
            administrador ou gerente aprovar. Administradores e gerentes publicam direto.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.requireApproval}
          aria-label="Exigir aprovação para vendedores"
          className={`${styles.switch} ${draft.requireApproval ? styles.switchOn : ''}`}
          disabled={!isAdmin}
          onClick={() => setDraft((current) => ({ ...current, requireApproval: !current.requireApproval }))}
        />
      </div>

      <div className={styles.settingRow} style={{ flexDirection: 'column' }}>
        <div>
          <strong>Contas marcadas ao criar um post</strong>
          <p>Escolha quais contas já vêm selecionadas em um post novo. Sem nenhuma marcada, todas as contas ativas vêm selecionadas.</p>
        </div>
        {accounts.length === 0 ? (
          <span className={styles.subtitle} style={{ fontSize: '0.85rem' }}>Nenhuma conta conectada.</span>
        ) : (
          <div className={styles.accountPicker}>
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={!isAdmin}
                className={`${styles.accountOption} ${draft.defaultAccountIds.includes(account.id) ? styles.accountOptionActive : ''}`}
                onClick={() => toggleDefaultAccount(account.id)}
              >
                <PlatformIcon platform={account.platform} />
                {account.platform === 'instagram' ? `@${account.username || account.name}` : account.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.settingRow}>
        <div>
          <strong>Fuso horário</strong>
          <p>
            Datas e horários aparecem no fuso do seu navegador ({Intl.DateTimeFormat().resolvedOptions().timeZone}) e os
            posts saem exatamente no horário escolhido.
          </p>
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
          {message && (
            <span className={message.type === 'error' ? styles.targetError : styles.subtitle} style={{ margin: 0 }}>
              {message.text}
            </span>
          )}
          <button type="button" className={styles.primaryButton} onClick={save} disabled={!dirty || saving}>
            <Save size={15} /> {saving ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      )}
    </div>
  );
}
