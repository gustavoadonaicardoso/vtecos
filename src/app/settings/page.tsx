"use client";

import React, { useState } from 'react';
import { 
  User, 
  Building2, 
  BellRing, 
  CreditCard, 
  Save,
  Globe,
  Lock,
  MessageSquare,
  ListCheck,
  Ticket
} from 'lucide-react';
import styles from './settings.module.css';
import { supabase } from '@/lib/supabase';

type TabType = 'profile' | 'company' | 'preferences' | 'integrations' | 'billing' | 'senhas';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  // Senhas States
  const [queueTotalDesks, setQueueTotalDesks] = useState(5);
  const [queueLogoUrl, setQueueLogoUrl] = useState('');
  const [queueBannerUrl, setQueueBannerUrl] = useState('');
  const [queueAppName, setQueueAppName] = useState('VÓRTICE PAINEL');
  const [queuePrimaryColor, setQueuePrimaryColor] = useState('#3b82f6');
  const [queueSecondaryColor, setQueueSecondaryColor] = useState('#8b5cf6');
  const [welcomeText, setWelcomeText] = useState('Bem-vindo ao nosso atendimento');
  const [isSaving, setIsSaving] = useState(false);

  // Perfil States
  const [profileName, setProfileName] = useState('Gustavo Admin');
  const [profileEmail, setProfileEmail] = useState('gustavo@vortice.tech');
  const [profilePhone, setProfilePhone] = useState('+55 11 99999-9999');

  // Empresa States
  const [companyName, setCompanyName] = useState('Vórtice Tecnologia');
  const [companyCNPJ, setCompanyCNPJ] = useState('44.555.666/0001-77');
  const [companySite, setCompanySite] = useState('vortice.tech');
  
  // Preferências
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifWhatsApp, setNotifWhatsApp] = useState(true);
  const [notifBrowser, setNotifBrowser] = useState(false);

  // Integrations States
  const [zapiInstance, setZapiInstance] = useState('');
  const [zapiToken, setZapiToken] = useState('');

  const fetchIntegrations = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('integrations_config').select('config').eq('provider', 'zapi').single();
    if (data) {
      setZapiInstance(data.config.instanceId || '');
      setZapiToken(data.config.token || '');
    }
  };

  React.useEffect(() => {
    if (activeTab === 'integrations') fetchIntegrations();
  }, [activeTab]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (activeTab === 'senhas') {
        const { error } = await supabase?.from('queue_settings').upsert({
          id: 'default',
          total_desks: queueTotalDesks,
          logo_url: queueLogoUrl,
          banner_url: queueBannerUrl,
          app_name: queueAppName,
          primary_color: queuePrimaryColor,
          secondary_color: queueSecondaryColor,
          welcome_text: welcomeText,
          updated_at: new Date().toISOString()
        }) || { error: 'Supabase missing' };

        if (error) throw error;
        alert("Configurações de senhas salvas com sucesso!");
      } else if (activeTab === 'integrations') {
        const { error } = await supabase?.from('integrations_config').upsert({
          provider: 'zapi',
          config: { instanceId: zapiInstance, token: zapiToken },
          updated_at: new Date().toISOString()
        }, { onConflict: 'provider' }) || { error: 'Supabase missing' };

        if (error) throw error;
        alert("Configurações da Z-API salvas com sucesso!");
      } else {
        alert("Configurações salvas com sucesso!");
      }
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderContent = () => {
    switch(activeTab) {
      case 'profile':
        return (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Meu Perfil</h3>
            
            <div className={styles.avatarUpload}>
              <div className={styles.avatarPreview}>
                GA
              </div>
              <div>
                <button className={styles.uploadBtn}>Trocar Foto (Avatar)</button>
                <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '8px' }}>JPG, GIF ou PNG. Máximo de 2MB.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Nome Completo</label>
                <input type="text" className={styles.input} value={profileName} onChange={e => setProfileName(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>E-mail (Login)</label>
                <input type="email" className={styles.input} value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>Telefone / WhatsApp</label>
                <input type="text" className={styles.input} value={profilePhone} onChange={e => setProfilePhone(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>Fuso Horário</label>
                <select className={styles.select}>
                  <option>Brasília (GMT-3)</option>
                  <option>Manaus (GMT-4)</option>
                </select>
              </div>
            </div>

            <div className={styles.dangerZone}>
              <div className={styles.dangerTitle}>Segurança da Conta</div>
              <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>Sua senha deve ter no mínimo 8 caracteres e uma combinação de letras e números.</p>
              <button className={styles.uploadBtn} style={{ borderColor: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={16} /> Redefinir Senha
              </button>
            </div>
          </div>
        );

      case 'company':
        return (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Dados da Empresa</h3>
            
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Razão Social / Nome Fantasia</label>
                <input type="text" className={styles.input} value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>CNPJ</label>
                <input type="text" className={styles.input} value={companyCNPJ} onChange={e => setCompanyCNPJ(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>Site Oficial</label>
                <input type="text" className={styles.input} value={companySite} onChange={e => setCompanySite(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label>Moeda Padrão</label>
                <select className={styles.select}>
                  <option>BRL - Real Brasileiro (R$)</option>
                  <option>USD - Dólar Americano ($)</option>
                  <option>EUR - Euro (€)</option>
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Endereço Completo</label>
                <input type="text" className={styles.input} placeholder="Rua, Número, Bairro, CEP..." />
              </div>
            </div>
          </div>
        );

      case 'preferences':
        return (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Notificações & Preferências</h3>
            
            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Alertas por E-mail</div>
                <div className={styles.toggleDesc}>Receba resumos diários e alertas de novos leads via e-mail corporativo.</div>
              </div>
              <div className={`${styles.toggleSwitch} ${notifEmail ? styles.active : ''}`} onClick={() => setNotifEmail(!notifEmail)}>
                <div className={styles.toggleSlider}></div>
              </div>
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleLabel}>Notificações no WhatsApp</div>
                <div className={styles.toggleDesc}>Receba mensagens instantâneas quando um lead responder aos funis ou te marcar.</div>
              </div>
              <div className={`${styles.toggleSwitch} ${notifWhatsApp ? styles.active : ''}`} onClick={() => setNotifWhatsApp(!notifWhatsApp)}>
                <div className={styles.toggleSlider}></div>
              </div>
            </div>

            <div className={styles.toggleRow} style={{ borderBottom: 'none' }}>
              <div>
                <div className={styles.toggleLabel}>Notificações de Navegador (Push)</div>
                <div className={styles.toggleDesc}>Pequenos popups na tela mesmo quando a aba do CRM estiver minimizada.</div>
              </div>
              <div className={`${styles.toggleSwitch} ${notifBrowser ? styles.active : ''}`} onClick={() => setNotifBrowser(!notifBrowser)}>
                <div className={styles.toggleSlider}></div>
              </div>
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div className={styles.panel}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '30px' }}>
              <div style={{ background: '#25D36615', padding: '12px', borderRadius: '12px', color: '#25D366' }}>
                <MessageSquare size={32} />
              </div>
              <div>
                <h3 className={styles.panelTitle} style={{ margin: 0 }}>Z-API (WhatsApp Business)</h3>
                <p style={{ fontSize: '0.9rem', opacity: 0.6 }}>Conecte sua instância da Z-API para automações de WhatsApp.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>ID da Instância (Instance ID)</label>
                <input 
                  type="text" 
                  className={styles.input} 
                  value={zapiInstance} 
                  onChange={e => setZapiInstance(e.target.value)}
                  placeholder="Ex: 3B4..." 
                />
              </div>
              <div className={styles.formGroup}>
                <label>Token da Instância (Token)</label>
                <input 
                  type="password" 
                  className={styles.input} 
                  value={zapiToken} 
                  onChange={e => setZapiToken(e.target.value)}
                  placeholder="Seu token Z-API" 
                />
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(37, 211, 102, 0.05)', borderRadius: '12px', border: '1px solid rgba(37, 211, 102, 0.1)' }}>
              <p style={{ fontSize: '0.9rem' }}><strong>Status:</strong> Verifique se sua instância está <strong>CONECTADA</strong> no portal da Z-API para que o sistema funcione.</p>
            </div>
          </div>
        );

      case 'senhas':
        return (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Painel de Senhas (White Label)</h3>
            
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Quantidade de Guichês</label>
                <input 
                  type="number" 
                  className={styles.input} 
                  value={queueTotalDesks} 
                  onChange={e => setQueueTotalDesks(parseInt(e.target.value))} 
                />
                <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '4px' }}>Define o limite de guichês no painel de controle.</p>
              </div>

              <div className={styles.formGroup}>
                <label>Cor Primária (Painéis)</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="color" className={styles.input} style={{ width: '60px', padding: '2px' }} value={queuePrimaryColor} onChange={e => setQueuePrimaryColor(e.target.value)} />
                  <input type="text" className={styles.input} value={queuePrimaryColor} onChange={e => setQueuePrimaryColor(e.target.value)} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Cor Secundária</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="color" className={styles.input} style={{ width: '60px', padding: '2px' }} value={queueSecondaryColor} onChange={e => setQueueSecondaryColor(e.target.value)} />
                  <input type="text" className={styles.input} value={queueSecondaryColor} onChange={e => setQueueSecondaryColor(e.target.value)} />
                </div>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Nome do Painel (Texto)</label>
                <input type="text" className={styles.input} value={queueAppName} onChange={e => setQueueAppName(e.target.value)} />
                <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '4px' }}>Aparecerá no topo do telão caso não haja um logo em imagem.</p>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Texto de Boas-vindas (Painel Público)</label>
                <input type="text" className={styles.input} value={welcomeText} onChange={e => setWelcomeText(e.target.value)} />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>URL do Banner Publicitário (Opcional)</label>
                <input type="text" className={styles.input} value={queueBannerUrl} onChange={e => setQueueBannerUrl(e.target.value)} placeholder="https://..." />
                <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '4px' }}>Exibido na lateral ou rodapé do telão público.</p>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>URL do Logo Específico (Opcional)</label>
                <input type="text" className={styles.input} value={queueLogoUrl} onChange={e => setQueueLogoUrl(e.target.value)} placeholder="https://..." />
                <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '4px' }}>Se vazio, usará o logo padrão do sistema.</p>
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '10px' }}><strong>Dica:</strong> Você pode usar imagens do seu próprio logo para que o sistema de senhas combine perfeitamente com a identidade visual da sua marca.</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <a href="/display" target="_blank" style={{ fontSize: '0.85rem', color: '#3b82f6', textDecoration: 'underline' }}>Pré-visualizar Painel</a>
                <a href="/totem" target="_blank" style={{ fontSize: '0.85rem', color: '#3b82f6', textDecoration: 'underline' }}>Pré-visualizar Totem</a>
              </div>
            </div>
          </div>
        );
        return (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Assinatura & Cobrança</h3>
            
            <div style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))', padding: '2rem', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <p style={{ fontWeight: 600, color: '#3b82f6', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Plano Atual</p>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Vórtice Pro <span style={{ fontSize: '1rem', opacity: 0.6, fontWeight: 500 }}>/ Anual</span></h2>
              <p style={{ opacity: 0.7, fontSize: '0.95rem' }}>Próxima renovação em <strong>15 de Novembro de 2026</strong>. Você está usando 4/10 licenças de usuário inclusas no plano.</p>
              
              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <button className={styles.saveBtn} style={{ background: '#3b82f6' }}>Gerenciar Assinatura</button>
                <button className={styles.uploadBtn}>Alterar Forma de Pagamento</button>
              </div>
            </div>

            <h4 style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '2rem' }}>Histórico de Faturas</h4>
            <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <tr>
                    <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--foreground)', opacity: 0.6 }}>Data</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--foreground)', opacity: 0.6 }}>Valor</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--foreground)', opacity: 0.6 }}>Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--foreground)', opacity: 0.6 }}>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>15/11/2025</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>R$ 1.990,00</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Pago</span></td>
                    <td style={{ padding: '12px 16px' }}><button style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>Baixar NF-e</button></td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        );
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <div className={styles.titleSection}>
          <h2>Configurações do Sistema</h2>
          <p>Gerencie seu perfil pessoal, dados corporativos e assinatura da Vórtice.</p>
        </div>
        
        <button className={styles.saveBtn} onClick={handleSave}>
          <Save size={18} /> Salvar Alterações
        </button>
      </header>

      <div className={styles.contentArea}>
        {/* Sidebar Interna */}
        <div className={styles.sidebarNav}>
          <button 
            className={`${styles.navItem} ${activeTab === 'profile' ? styles.navItemActive : ''}`} 
            onClick={() => setActiveTab('profile')}
          >
            <User size={18} /> Meu Perfil
          </button>
          <button 
            className={`${styles.navItem} ${activeTab === 'company' ? styles.navItemActive : ''}`} 
            onClick={() => setActiveTab('company')}
          >
            <Building2 size={18} /> Dados da Empresa
          </button>
          <button 
            className={`${styles.navItem} ${activeTab === 'preferences' ? styles.navItemActive : ''}`} 
            onClick={() => setActiveTab('preferences')}
          >
            <BellRing size={18} /> Notificações
          </button>
          <button 
            className={`${styles.navItem} ${activeTab === 'billing' ? styles.navItemActive : ''}`} 
            onClick={() => setActiveTab('billing')}
          >
            <CreditCard size={18} /> Assinatura & Faturas
          </button>
          <button 
            className={`${styles.navItem} ${activeTab === 'integrations' ? styles.navItemActive : ''}`} 
            onClick={() => setActiveTab('integrations')}
          >
            <MessageSquare size={18} /> Integrações
          </button>
          <button 
            className={`${styles.navItem} ${activeTab === 'senhas' ? styles.navItemActive : ''}`} 
            onClick={() => setActiveTab('senhas')}
          >
            <Ticket size={18} /> Gestão de Senhas
          </button>
        </div>

        {/* Área de Formulários Dinâmica */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
