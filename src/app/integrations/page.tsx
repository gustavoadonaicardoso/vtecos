"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  MessageCircle, 
  FileSpreadsheet, 
  LayoutGrid, 
  Camera, 
  Mail, 
  Globe,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  X,
  Link2,
  Lock,
  ChevronRight,
  Loader2,
  Zap,
  Edit3,
  Eye,
  EyeOff,
  Info,
  GitBranch
} from 'lucide-react';
import styles from './integrations.module.css';
import { supabase } from '@/lib/supabase';
import { WhatsAppService } from '@/lib/whatsapp';

const INTEGRATIONS = [
  {
    id: 'whatsapp',
    name: 'WhatsApp Business API',
    description: 'Integração oficial via Meta para envio de mensagens escaláveis e automação profissional.',
    icon: MessageCircle,
    category: 'Comunicação',
    status: 'pending', // Mudando para pendente para incentivar a configuração
    color: '#25D366'
  },
  {
    id: 'zapi',
    name: 'Z-API (WhatsApp)',
    description: 'Conecte sua conta Z-API para automações rápidas sem burocracia do Facebook Business Manager.',
    icon: Zap,
    category: 'Comunicação',
    status: 'not_connected',
    color: '#11c1d9'
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Exporte leads e dados de desempenho automaticamente para suas planilhas compartilhadas.',
    icon: FileSpreadsheet,
    category: 'Produtividade',
    status: 'not_connected',
    color: '#0F9D58'
  },
  {
    id: 'meta-ads',
    name: 'Meta (IG Direct & Messenger)',
    description: 'Centralize mensagens do Direct e Messenger. Sincronize leads do Facebook Ads automaticamente.',
    icon: LayoutGrid,
    category: 'Marketing',
    status: 'not_connected',
    color: '#1877F2'
  },
  {
    id: 'email',
    name: 'Email Marketing',
    description: 'Conecte seu e-mail comercial para rastrear taxas de abertura e histórico de respostas automaticamente.',
    icon: Mail,
    category: 'Comunicação',
    status: 'not_connected',
    color: '#EA4335'
  },
  {
    id: 'webhook',
    name: 'Webhooks Customizados',
    description: 'Crie integrações personalizadas com qualquer serviço externo usando nossa robusta API.',
    icon: Globe,
    category: 'Desenvolvimento',
    status: 'not_connected',
    color: '#3b82f6'
  }
];

const CATEGORIES = ['Todos', 'Marketing', 'Comunicação', 'Produtividade', 'Desenvolvimento'];

export default function Integrations() {
  const [filter, setFilter] = useState('Todos'); // Changed to localized "Todos"
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<string | null>(null);
  
  // WhatsApp Config State
  const [waConfig, setWaConfig] = useState({
    token: '',
    phoneId: '',
    wabaId: ''
  });
  
  // Meta Config State
  const [metaConfig, setMetaConfig] = useState({
    pageToken: '',
    pageId: '',
    instagramId: ''
  });

  // Z-API Config State
  const [zapiConfig, setZapiConfig] = useState({
    name: '',
    instanceId: '',
    token: '',
    clientToken: '',
    receiveGroups: false,
    initialFlow: ''
  });

  // Webhook Config State
  const [webhookConfig, setWebhookConfig] = useState({
    url: '',
    secret: ''
  });

  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [zapiQr, setZapiQr] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);

  const fetchZapiQrCode = async () => {
    if (!zapiConfig.instanceId || !zapiConfig.token) {
      alert("Informe o Instance ID e Token primeiro.");
      return;
    }
    
    setIsFetchingQr(true);
    setZapiQr(null);
    
    try {
      const response = await fetch(`https://api.z-api.io/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/qr-code`);
      const data = await response.json();
      
      if (data.value) {
        setZapiQr(data.value); // Base64 image
      } else {
        alert("Instância já está conectada ou erro ao gerar QR.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao conectar com Z-API.");
    } finally {
      setIsFetchingQr(false);
    }
  };

  const handleTestConnection = async () => {
    if (!waConfig.token || !waConfig.phoneId) {
       alert("Preencha o Token e o Phone ID primeiro!");
       return;
    }
    
    setIsTesting(true);
    const success = await WhatsAppService.validateConnection({
      token: waConfig.token,
      phoneId: waConfig.phoneId
    });
    
    setIsTesting(false);
    if (success) {
      alert("✅ Conexão validada com sucesso via Meta Graph API!");
    } else {
      alert("❌ Falha na conexão. Verifique o Token e o ID do Telefone.");
    }
  };

  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);

  const fetchConfigs = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('integrations_config').select('*');
    if (data) {
      const providers = data.map(item => item.provider);
      setConnectedProviders(providers);
      
      data.forEach(item => {
        if (item.provider === 'zapi') {
          setZapiConfig({
            name: item.config.name || '',
            instanceId: item.config.instanceId || '',
            token: item.config.token || '',
            clientToken: item.config.clientToken || '',
            receiveGroups: item.config.receiveGroups || false,
            initialFlow: item.config.initialFlow || ''
          });
        } else if (item.provider === 'whatsapp_meta') {
          setWaConfig({ token: item.config.token, phoneId: item.config.phoneId, wabaId: item.config.wabaId });
        } else if (item.provider === 'meta_ads') {
          setMetaConfig({ pageToken: item.config.pageToken, pageId: item.config.pageId, instagramId: item.config.instagramId });
        } else if (item.provider === 'webhook_custom') {
          setWebhookConfig({ url: item.config.url, secret: item.config.secret });
        }
      });
    }
  };

  React.useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSaveConfig = async (type: 'whatsapp' | 'meta' | 'zapi' = 'whatsapp') => {
     if (!supabase) return;
     setSaveStatus('saving');
     
     try {
       let configToSave = {};
       let provider = '';

       if (type === 'zapi') {
         configToSave = zapiConfig;
         provider = 'zapi';
       } else if (type === 'whatsapp') {
         configToSave = waConfig;
         provider = 'whatsapp_meta';
       } else if (type === 'webhook' as any) {
         configToSave = webhookConfig;
         provider = 'webhook_custom';
       } else {
         configToSave = metaConfig;
         provider = 'meta_ads';
       }

       const { error } = await supabase.from('integrations_config').upsert({
         provider,
         config: configToSave,
         updated_at: new Date().toISOString()
       }, { onConflict: 'provider' });

       if (error) throw error;

       setSaveStatus('success');
       setTimeout(() => {
         setActiveModal(null);
         setSaveStatus('idle');
         // O status visual será atualizado no próximo reload ou via estado global se implementado
       }, 1500);
     } catch (err) {
       console.error(err);
       setSaveStatus('error');
       alert("Erro ao salvar configuração.");
       setTimeout(() => setSaveStatus('idle'), 3000);
     }
  };

  const handleDisconnect = async (provider: string) => {
    const confirmed = confirm(
      `Tem certeza que deseja remover a integração com ${provider === 'zapi' ? 'Z-API' : provider}? Esta ação irá apagar todas as credenciais salvas.`
    );
    if (!confirmed || !supabase) return;

    try {
      const { error } = await supabase
        .from('integrations_config')
        .delete()
        .eq('provider', provider);

      if (error) throw error;

      setConnectedProviders(prev => prev.filter(p => p !== provider));

      if (provider === 'zapi') {
        setZapiConfig({ name: '', instanceId: '', token: '', clientToken: '', receiveGroups: false, initialFlow: '' });
        setZapiQr(null);
      }

      setActiveModal(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao remover integração.');
    }
  };

  const filteredIntegrations = INTEGRATIONS.map(item => {
    let currentStatus = item.status;
    if (item.id === 'zapi' && connectedProviders.includes('zapi')) currentStatus = 'connected';
    if (item.id === 'whatsapp' && connectedProviders.includes('whatsapp_meta')) currentStatus = 'connected';
    if (item.id === 'meta-ads' && connectedProviders.includes('meta_ads')) currentStatus = 'connected';
    if (item.id === 'webhook' && connectedProviders.includes('webhook_custom')) currentStatus = 'connected';
    
    return { ...item, status: currentStatus };
  }).filter(item => {
    const matchesFilter = filter === 'Todos' || item.category === filter;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const openAppModal = (id: string) => {
    setActiveModal(id);
  };

  const renderModalContent = () => {
    if (activeModal === 'whatsapp') {
      return (
        <>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>
              <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#25D36622', color: '#25D366' }}>
                <MessageCircle size={20} />
              </div>
              <div>
                <span style={{ fontSize: '1.1rem', display: 'block' }}>Configuração Official WhatsApp API</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 400 }}>Plataforma Meta for Developers</span>
              </div>
            </div>
            <button className={styles.closeBtn} onClick={() => setActiveModal(null)}><X size={20} /></button>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.alertBox}>
              <p>Utilize o <strong>Token de Acesso Permanente (System User)</strong> para garantir que a conexão não expire.</p>
              <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" style={{ color: '#25D366', fontSize: '0.8rem', textDecoration: 'underline', marginTop: '4px', display: 'inline-block' }}>Acessar Portal do Desenvolvedor →</a>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Token de Acesso (API Key)</label>
                <div className={styles.inputWrapper}>
                   <input 
                      type="password" 
                      name="wa-token"
                      autoComplete="new-password"
                      placeholder="EAAG..." 
                      className={styles.premiumInput} 
                      value={waConfig.token || ''}
                      onChange={(e) => setWaConfig({...waConfig, token: e.target.value})}
                   />
                   <Lock size={14} className={styles.inputIcon} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className={styles.formGroup}>
                  <label>ID do Número de Telefone</label>
                  <input 
                    type="text" 
                    name="wa-phone-id"
                    autoComplete="off"
                    placeholder="Ex: 109283..." 
                    className={styles.premiumInput} 
                    value={waConfig.phoneId || ''}
                    onChange={(e) => setWaConfig({...waConfig, phoneId: e.target.value})}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>ID da Conta Business (WABA)</label>
                  <input 
                    type="text" 
                    name="wa-account-id"
                    autoComplete="off"
                    placeholder="Ex: 987654..." 
                    className={styles.premiumInput} 
                    value={waConfig.wabaId || ''}
                    onChange={(e) => setWaConfig({...waConfig, wabaId: e.target.value})}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Webhook Verify Token (Opcional)</label>
                <div className={styles.inputWrapper}>
                  <input type="text" defaultValue="vortice_verify_token_2024" readOnly className={styles.premiumInput} style={{ background: 'rgba(255,255,255,0.03)', cursor: 'not-allowed' }} />
                  <CheckCircle2 size={14} className={styles.inputIcon} color="#25D366" />
                </div>
                <small style={{ opacity: 0.5, marginTop: '4px', display: 'block' }}>URL Webhook: https://system-vt.vercel.app/api/webhooks/whatsapp</small>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
               <h5 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Recursos Ativados:</h5>
               <ul style={{ fontSize: '0.85rem', opacity: 0.7, paddingLeft: '1.2rem', lineHeight: '1.6' }}>
                  <li>Envio de Templates Oficiais (Utility, Marketing)</li>
                  <li>Recebimento de Mensagens e Mídia em Tempo Real</li>
                  <li>Métricas de Entrega e Leitura (Read Receipts)</li>
                  <li>Suporte a Botões Interativos e Listas</li>
               </ul>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button className={styles.btnCancel} onClick={() => setActiveModal(null)}>Cancelar</button>
            <div style={{ display: 'flex', gap: '10px' }}>
               <button 
                  className={styles.btnTest} 
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'white', padding: '10px 15px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
               >
                 {isTesting && <Loader2 size={14} className={styles.loader} />}
                 {isTesting ? 'Validando...' : 'Testar Conexão'}
               </button>
               <button 
                  className={styles.btnSave} 
                  onClick={() => handleSaveConfig('whatsapp')}
                  disabled={saveStatus !== 'idle'}
                  style={{ background: '#25D366', color: 'black' }}
               >
                 {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'success' ? 'Salvo!' : 'Salvar e Ativar API'}
               </button>
            </div>
          </div>
        </>
      );
    }

    if (activeModal === 'meta-ads') {
      return (
        <>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>
              <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#1877F222', color: '#1877F2' }}>
                <LayoutGrid size={20} />
              </div>
              <div>
                <span style={{ fontSize: '1.1rem', display: 'block' }}>Configuração Meta Messaging</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Messenger & Instagram Direct API</span>
              </div>
            </div>
            <button className={styles.closeBtn} onClick={() => setActiveModal(null)}><X size={20} /></button>
          </div>
          <div className={styles.modalBody}>
             <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1, padding: '1rem', background: 'rgba(24, 119, 242, 0.05)', borderRadius: '12px', border: '1px solid rgba(24, 119, 242, 0.2)', textAlign: 'center' }}>
                    <MessageCircle size={20} color="#1877F2" style={{ marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Messenger</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Ativo via Page API</div>
                </div>
                <div style={{ flex: 1, padding: '1rem', background: 'rgba(225, 48, 108, 0.05)', borderRadius: '12px', border: '1px solid rgba(225, 48, 108, 0.2)', textAlign: 'center' }}>
                    <Camera size={20} color="#E1306C" style={{ marginBottom: '8px' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Instagram</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Ativo via Graph API</div>
                </div>
             </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Page Access Token (Token da Página)</label>
                <div className={styles.inputWrapper}>
                   <input 
                      type="password" 
                      name="meta-page-token"
                      autoComplete="new-password"
                      placeholder="EAAO..." 
                      className={styles.premiumInput} 
                      value={metaConfig.pageToken || ''}
                      onChange={(e) => setMetaConfig({...metaConfig, pageToken: e.target.value})}
                   />
                   <Lock size={14} className={styles.inputIcon} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className={styles.formGroup}>
                  <label>ID da Página Facebook</label>
                  <input 
                    type="text" 
                    name="meta-page-id"
                    autoComplete="off"
                    placeholder="Ex: 1045..." 
                    className={styles.premiumInput} 
                    value={metaConfig.pageId || ''}
                    onChange={(e) => setMetaConfig({...metaConfig, pageId: e.target.value})}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>ID Instagram Business</label>
                  <input 
                    type="text" 
                    name="meta-ig-id"
                    autoComplete="off"
                    placeholder="Ex: 1784..." 
                    className={styles.premiumInput} 
                    value={metaConfig.instagramId || ''}
                    onChange={(e) => setMetaConfig({...metaConfig, instagramId: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                 <p style={{ fontSize: '0.8rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Globe size={14} /> Webhook Meta: <code>https://system-vt.vercel.app/api/webhooks/meta</code>
                 </p>
              </div>

               <button 
                  style={{ width: '100%', padding: '12px', background: '#1877F2', color: 'white', borderRadius: '12px', border: 'none', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', marginTop: '0.5rem' }}
                >
                  <Lock size={16} /> Autenticar via OAuth2 (Rápido)
                </button>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button className={styles.btnCancel} onClick={() => setActiveModal(null)}>Cancelar</button>
            <button 
                className={styles.btnSave} 
                onClick={() => handleSaveConfig('meta')}
                style={{ background: '#1877F2', color: 'white' }}
                disabled={saveStatus !== 'idle'}
            >
               {saveStatus === 'saving' ? 'Conectando...' : saveStatus === 'success' ? 'Salvo!' : 'Ativar Integração Meta'}
            </button>
          </div>
        </>
      );
    }

    if (activeModal === 'zapi') {
      return (
        <>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>
              <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#11c1d922', color: '#11c1d9' }}>
                <Edit3 size={20} />
              </div>
              <div>
                <span style={{ fontSize: '1.1rem', display: 'block', fontWeight: 600 }}>Editar Conexão</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Gerencie os parâmetros da sua instância Z-API</span>
              </div>
            </div>
            <button className={styles.closeBtn} onClick={() => setActiveModal(null)}><X size={20} /></button>
          </div>
          <div className={styles.modalBody} style={{ gap: '1.25rem', display: 'flex', flexDirection: 'column' }}>
            
            <div className={styles.formGroup}>
              <label>Nome da conexão</label>
              <input 
                type="text" 
                placeholder="Ex: Valéria | IA" 
                className={styles.premiumInput} 
                value={zapiConfig.name || ''}
                onChange={(e) => setZapiConfig({...zapiConfig, name: e.target.value})}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Instance ID</label>
              <input 
                type="text" 
                placeholder="ID da sua instância" 
                className={styles.premiumInput} 
                value={zapiConfig.instanceId || ''}
                onChange={(e) => setZapiConfig({...zapiConfig, instanceId: e.target.value})}
              />
            </div>

            <div className={styles.formGroup}>
               <label>Token <span style={{ opacity: 0.5, fontWeight: 400 }}>(vazio = manter)</span></label>
               <div className={styles.inputWrapper}>
                 <input 
                   type="password" 
                   className={styles.premiumInput} 
                   value={zapiConfig.token || ''}
                   onChange={(e) => setZapiConfig({...zapiConfig, token: e.target.value})}
                 />
                 <Eye size={16} className={styles.inputIcon} style={{ cursor: 'pointer', opacity: 0.5 }} />
               </div>
            </div>

            <div className={styles.formGroup}>
               <label>Security Token (Client-Token) <span style={{ opacity: 0.5, fontWeight: 400 }}>(vazio = manter)</span></label>
               <input 
                 type="text" 
                 placeholder="Token de segurança da instância" 
                 className={styles.premiumInput} 
                 value={zapiConfig.clientToken || ''}
                 onChange={(e) => setZapiConfig({...zapiConfig, clientToken: e.target.value})}
               />
               <small style={{ opacity: 0.4, marginTop: '4px', display: 'block' }}>Encontre em: Painel Z-API → Sua Instância → Security Token</small>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
               <div>
                 <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>Receber mensagens de grupos</p>
                 <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Mensagens de grupos do WhatsApp serão processadas como conversas</p>
               </div>
               <label className={styles.switch}>
                 <input 
                    type="checkbox" 
                    checked={zapiConfig.receiveGroups || false}
                    onChange={(e) => setZapiConfig({...zapiConfig, receiveGroups: e.target.checked})}
                 />
                 <span className={`${styles.slider} ${styles.round}`}></span>
               </label>
            </div>

            <div style={{ padding: '1rem', background: 'rgba(168, 85, 247, 0.05)', borderRadius: '16px', border: '1px solid rgba(168, 85, 247, 0.1)', display: 'flex', gap: '12px' }}>
               <div style={{ color: '#a855f7', marginTop: '2px' }}><Info size={18} /></div>
               <div>
                 <p style={{ fontSize: '0.85rem', color: '#a855f7', fontWeight: 600, marginBottom: '4px' }}>Configure o webhook no painel Z-API:</p>
                 <code style={{ background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', display: 'block' }}>
                   https://system-vt.vercel.app/api/webhooks/z-api
                 </code>
               </div>
            </div>

            <div className={styles.formGroup}>
              <label>Fluxo Inicial <span style={{ opacity: 0.5, fontWeight: 400 }}>(opcional)</span></label>
              <div className={styles.inputWrapper}>
                <input 
                  type="text" 
                  placeholder="Selecione um fluxo..." 
                  className={styles.premiumInput} 
                  value={zapiConfig.initialFlow || ''}
                  onChange={(e) => setZapiConfig({...zapiConfig, initialFlow: e.target.value})}
                />
                <GitBranch size={16} className={styles.inputIcon} style={{ opacity: 0.5 }} />
              </div>
            </div>

            <div className={styles.qrContainer} style={{ marginTop: '0.5rem', textAlign: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid var(--border)' }}>
               {zapiQr ? (
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'white', padding: '12px', borderRadius: '12px', lineHeight: 0 }}>
                      <img src={zapiQr} alt="Z-API QR Code" style={{ width: '150px', height: '150px' }} />
                    </div>
                    <button onClick={fetchZapiQrCode} style={{ background: 'none', border: 'none', color: '#11c1d9', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>
                      Atualizar QR Code
                    </button>
                 </div>
               ) : (
                 <button 
                   className={styles.btnTest} 
                   onClick={fetchZapiQrCode}
                   disabled={isFetchingQr}
                   style={{ margin: '0 auto', background: 'rgba(17, 193, 217, 0.1)', color: '#11c1d9', border: '1px solid #11c1d944' }}
                 >
                   {isFetchingQr ? <Loader2 size={16} className={styles.loader} /> : <Zap size={16} />}
                   {isFetchingQr ? 'Gerando QR...' : 'Gerar QR Code de Conexão'}
                 </button>
               )}
            </div>

          </div>
          <div className={styles.modalFooter}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className={styles.btnCancel} onClick={() => setActiveModal(null)}>Cancelar</button>
              {connectedProviders.includes('zapi') && (
                <button
                  onClick={() => handleDisconnect('zapi')}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)')}
                >
                  <X size={14} /> Remover Integração
                </button>
              )}
            </div>
            <button 
                className={styles.btnSave} 
                onClick={() => (handleSaveConfig as any)('zapi')}
                style={{ background: '#11c1d9', color: 'black' }}
                disabled={saveStatus !== 'idle'}
            >
               {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'success' ? 'Salvo!' : 'Salvar Alterações'}
            </button>
          </div>
        </>
      );
    }

    if (activeModal === 'webhook') {
      return (
        <>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>
              <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#3b82f622', color: '#3b82f6' }}>
                <Globe size={20} />
              </div>
              <div>
                <span style={{ fontSize: '1.1rem', display: 'block' }}>Configurar Webhooks Customizados</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Comunicação total via API</span>
              </div>
            </div>
            <button className={styles.closeBtn} onClick={() => setActiveModal(null)}><X size={20} /></button>
          </div>
          <div className={styles.modalBody}>
            <div className={styles.alertBox} style={{ marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
               <p><strong>URL de Notificação:</strong> Toda vez que o CRM receber uma mensagem ou lead, enviaremos um POST para a URL configurada abaixo.</p>
            </div>

            <div className={styles.formGrid}>
               <div className={styles.formGroup}>
                 <label>Endpoint para Recebimento (Sua URL)</label>
                 <input 
                    type="url" 
                    placeholder="https://suaapi.com/webhooks/vortice" 
                    autoComplete="off"
                    className={styles.premiumInput} 
                    value={webhookConfig.url || ''}
                    onChange={(e) => setWebhookConfig({...webhookConfig, url: e.target.value})}
                 />
               </div>
               <div className={styles.formGroup}>
                 <label>Security Token / Secret</label>
                 <input 
                    type="password" 
                    placeholder="Sua chave de segurança" 
                    autoComplete="new-password"
                    className={styles.premiumInput} 
                    value={webhookConfig.secret || ''}
                    onChange={(e) => setWebhookConfig({...webhookConfig, secret: e.target.value})}
                 />
                 <small style={{ opacity: 0.5, marginTop: '4px', display: 'block' }}>Usado para assinar o cabeçalho e validar a origem do POST.</small>
               </div>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border)' }}>
               <h5 style={{ fontSize: '0.85rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Link2 size={14} /> Sua URL de Entrada (Para Enviar ao CRM)
               </h5>
               <code>https://api.vorticecrm.com/v1/webhook/incoming</code>
               <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '8px' }}>Utilize este endpoint para injetar leads ou enviar mensagens via sistemas externos.</p>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button className={styles.btnCancel} onClick={() => setActiveModal(null)}>Cancelar</button>
            <button 
                className={styles.btnSave} 
                onClick={() => (handleSaveConfig as any)('webhook')}
                style={{ background: '#3b82f6', color: 'white' }}
                disabled={saveStatus !== 'idle'}
            >
               {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'success' ? 'Ativo!' : 'Salvar Configuração'}
            </button>
          </div>
        </>
      );
    }

    if (activeModal === 'google-sheets') {
      return (
        <>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>
              <div className={styles.iconBox} style={{ width: 40, height: 40, background: '#0F9D5822', color: '#0F9D58' }}>
                <FileSpreadsheet size={20} />
              </div>
              Integração Google Sheets
            </div>
            <button className={styles.closeBtn} onClick={() => setActiveModal(null)}><X size={20} /></button>
          </div>
          <div className={styles.modalBody}>
             <p style={{ opacity: 0.7, fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1rem' }}>
              Cole o link compartilhado da sua planilha do Google Sheets. Toda vez que um Lead for inserido no pipeline, ele será escrito na primeira aba (aba base).
            </p>
            <div className={styles.formGroup}>
              <label>Link da Planilha (URL ou ID)</label>
              <input type="text" placeholder="https://docs.google.com/spreadsheets/d/1A2B3C..." />
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '12px', marginTop: '1rem', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Link2 size={24} color="#0F9D58" opacity={0.5} />
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                Lembre-se de dar permissão de "Editor" para <strong>vortice-api@appspot.gserviceaccount.com</strong> na sua planilha.
              </div>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button className={styles.btnCancel} onClick={() => setActiveModal(null)}>Cancelar</button>
            <button className={styles.btnSave} style={{ background: '#0F9D58' }}>Sincronizar Planilha</button>
          </div>
        </>
      );
    }

    // Default Custom Integration 
    return (
       <>
          <div className={styles.modalHeader}>
            <div className={styles.modalTitle}>Conexão Genérica</div>
            <button className={styles.closeBtn} onClick={() => setActiveModal(null)}><X size={20} /></button>
          </div>
          <div className={styles.modalBody}>
            <p>Integração será construída via Backend.</p>
          </div>
       </>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h2 className={styles.title}>Centro de Integrações</h2>
            <p className={styles.subtitle}>Potencialize seu CRM Vórtice com as plataformas oficiais de vendas.</p>
          </motion.div>
          
          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{connectedProviders.length}</span>
              <span className={styles.statLabel}>Conectado(s)</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>5</span>
              <span className={styles.statLabel}>Disponíveis</span>
            </div>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchWrapper}>
            <Search size={18} className={styles.searchIcon} />
            <input 
              type="text" 
              name="integration-search"
              autoComplete="off"
              placeholder="Buscar integrações..." 
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.filterList}>
            {CATEGORIES.map(cat => (
              <button 
                key={cat}
                className={`${styles.filterBtn} ${filter === cat ? styles.filterBtnActive : ''}`}
                onClick={() => setFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      <motion.div 
        className={styles.grid}
        layout
      >
        <AnimatePresence mode="popLayout">
          {filteredIntegrations.map((item, index) => (
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
                  onClick={() => openAppModal(item.id)}
                >
                  {item.status === 'connected' ? 'Configurar Instância' : 'Conectar Agora'}
                  {item.status !== 'connected' && <ArrowUpRight size={16} />}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <div className={styles.customRequest}>
        <div className={styles.requestContent}>
          <h3>Precisa de uma integração personalizada via API?</h3>
          <p>Fale com nossa equipe técnica engenharia para desenhar endpoints dedicados.</p>
        </div>
        <button className={styles.requestBtn}>
          Falar com Suporte Técnico
        </button>
      </div>

      {activeModal && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            {renderModalContent()}
          </div>
        </div>
      )}
    </div>
  );
}
