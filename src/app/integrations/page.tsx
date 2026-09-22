"use client";

import React, { useState } from 'react';
import styles from './integrations.module.css';
import { supabase } from '@/lib/supabase';
import { WhatsAppService } from '@/lib/whatsapp';

import {
  INTEGRATIONS,
  type WaConfig,
  type MetaConfig,
  type WebConfig,
  type WebhookConfig,
  type SaveStatus,
  type WhatsAppWebConnectionState,
} from './constants';
import IntegrationsHeader from './components/IntegrationsHeader';
import IntegrationsGrid from './components/IntegrationsGrid';
import WhatsAppModal from './components/modals/WhatsAppModal';
import MetaAdsModal from './components/modals/MetaAdsModal';
import WhatsAppWebModal from './components/modals/WhatsAppWebModal';
import WebhookModal from './components/modals/WebhookModal';
import GoogleSheetsModal from './components/modals/GoogleSheetsModal';
import GenericModal from './components/modals/GenericModal';

export default function Integrations() {
  const [filter, setFilter] = useState('Todos'); // Changed to localized "Todos"
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [originUrl, setOriginUrl] = useState('https://vtec.vorticetecnologia.com.br');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }
  }, []);

  // WhatsApp Config State
  const [waConfig, setWaConfig] = useState<WaConfig>({
    token: '',
    phoneId: '',
    wabaId: ''
  });

  // Meta Config State
  const [metaConfig, setMetaConfig] = useState<MetaConfig>({
    pageToken: '',
    pageId: '',
    instagramId: ''
  });

  const [webConfig, setWebConfig] = useState<WebConfig>({ name: 'WhatsApp principal' });

  // Webhook Config State
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    url: '',
    secret: ''
  });

  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [whatsappWebQr, setWhatsAppWebQr] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  const [whatsappWebConnection, setWhatsAppWebConnection] = useState<WhatsAppWebConnectionState>('idle');
  const [whatsappWebConnectionMessage, setWhatsAppWebConnectionMessage] = useState('');
  const qrRefreshCount = React.useRef(0);

  const requestWhatsAppWeb = React.useCallback(async () => {
    const response = await fetch('/api/whatsapp/web/connection', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao conectar com o WhatsApp Web.');
    return data;
  }, []);

  const fetchWhatsAppWebQrCode = React.useCallback(async (isRefresh = false) => {
    setIsFetchingQr(true);
    if (!isRefresh) {
      setWhatsAppWebQr(null);
      qrRefreshCount.current = 0;
    }
    setWhatsAppWebConnection('waiting');
    setWhatsAppWebConnectionMessage('Aguardando leitura do QR Code...');

    try {
      const status = await requestWhatsAppWeb();
      if (status.connected) {
        setWhatsAppWebQr(null);
        setWhatsAppWebConnection('connected');
        setWhatsAppWebConnectionMessage('WhatsApp conectado com sucesso.');
        return;
      }

      setWhatsAppWebQr(status.qrCode || null);
    } catch (err) {
      console.error(err);
      setWhatsAppWebConnection('error');
      setWhatsAppWebConnectionMessage(err instanceof Error ? err.message : 'Erro ao conectar com WhatsApp Web.');
    } finally {
      setIsFetchingQr(false);
    }
  }, [requestWhatsAppWeb]);

  React.useEffect(() => {
    if (activeModal !== 'whatsapp-web' || whatsappWebConnection !== 'waiting') return;

    const timer = window.setInterval(async () => {
      try {
        const status = await requestWhatsAppWeb();
        if (status.connected) {
          setWhatsAppWebQr(null);
          setWhatsAppWebConnection('connected');
          setWhatsAppWebConnectionMessage('WhatsApp conectado com sucesso. Salve a integração para ativá-la no CRM.');
          window.clearInterval(timer);
          return;
        }

        if (status.qrCode) setWhatsAppWebQr(status.qrCode);

        if (qrRefreshCount.current >= 30) {
          setWhatsAppWebQr(null);
          setWhatsAppWebConnection('idle');
          setWhatsAppWebConnectionMessage('QR Code expirado. Gere um novo código para tentar novamente.');
          window.clearInterval(timer);
          return;
        }

        qrRefreshCount.current += 1;
      } catch (error) {
        setWhatsAppWebConnection('error');
        setWhatsAppWebConnectionMessage(error instanceof Error ? error.message : 'Falha ao verificar a conexão.');
        window.clearInterval(timer);
      }
    }, 2_000);

    return () => window.clearInterval(timer);
  }, [activeModal, requestWhatsAppWeb, whatsappWebConnection]);

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
        if (item.provider === 'whatsapp_web') {
          setWebConfig({ name: item.config.name || 'WhatsApp principal' });
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

  const handleSaveConfig = async (type: 'whatsapp' | 'meta' | 'whatsapp-web' | 'webhook' = 'whatsapp') => {
     if (!supabase) return;
     setSaveStatus('saving');

     try {
       let configToSave = {};
       let provider = '';

       if (type === 'whatsapp-web') {
         configToSave = webConfig;
         provider = 'whatsapp_web';
       } else if (type === 'whatsapp') {
         configToSave = waConfig;
         provider = 'whatsapp_meta';
       } else if (type === 'webhook') {
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

       setConnectedProviders(prev => prev.includes(provider) ? prev : [...prev, provider]);
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
      `Tem certeza que deseja remover a integração com ${provider === 'whatsapp_web' ? 'WhatsApp Web' : provider}?`
    );
    if (!confirmed || !supabase) return;

    try {
      if (provider === 'whatsapp_web') {
        const response = await fetch('/api/whatsapp/web/connection', {
          method: 'DELETE',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível desconectar o WhatsApp.');
      }

      const { error } = await supabase
        .from('integrations_config')
        .delete()
        .eq('provider', provider);

      if (error) throw error;

      setConnectedProviders(prev => prev.filter(p => p !== provider));

      if (provider === 'whatsapp_web') {
        setWebConfig({ name: 'WhatsApp principal' });
        setWhatsAppWebQr(null);
        setWhatsAppWebConnection('idle');
        setWhatsAppWebConnectionMessage('');
      }

      setActiveModal(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao remover integração.');
    }
  };

  const filteredIntegrations = INTEGRATIONS.map(item => {
    let currentStatus = item.status;
    if (item.id === 'whatsapp-web' && connectedProviders.includes('whatsapp_web')) currentStatus = 'connected';
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

  const closeModal = () => setActiveModal(null);

  const renderModalContent = () => {
    if (activeModal === 'whatsapp') {
      return (
        <WhatsAppModal
          waConfig={waConfig}
          onWaConfigChange={setWaConfig}
          isTesting={isTesting}
          saveStatus={saveStatus}
          originUrl={originUrl}
          onTestConnection={handleTestConnection}
          onSave={() => handleSaveConfig('whatsapp')}
          onClose={closeModal}
        />
      );
    }

    if (activeModal === 'meta-ads') {
      return (
        <MetaAdsModal
          metaConfig={metaConfig}
          onMetaConfigChange={setMetaConfig}
          saveStatus={saveStatus}
          originUrl={originUrl}
          onSave={() => handleSaveConfig('meta')}
          onClose={closeModal}
        />
      );
    }

    if (activeModal === 'whatsapp-web') {
      return (
        <WhatsAppWebModal
          webConfig={webConfig}
          onWebConfigChange={setWebConfig}
          whatsappWebQr={whatsappWebQr}
          whatsappWebConnection={whatsappWebConnection}
          whatsappWebConnectionMessage={whatsappWebConnectionMessage}
          isFetchingQr={isFetchingQr}
          saveStatus={saveStatus}
          isConnected={connectedProviders.includes('whatsapp_web')}
          onFetchQr={() => fetchWhatsAppWebQrCode()}
          onSave={() => handleSaveConfig('whatsapp-web')}
          onDisconnect={() => handleDisconnect('whatsapp_web')}
          onClose={closeModal}
        />
      );
    }

    if (activeModal === 'webhook') {
      return (
        <WebhookModal
          webhookConfig={webhookConfig}
          onWebhookConfigChange={setWebhookConfig}
          saveStatus={saveStatus}
          onSave={() => handleSaveConfig('webhook')}
          onClose={closeModal}
        />
      );
    }

    if (activeModal === 'google-sheets') {
      return <GoogleSheetsModal onClose={closeModal} />;
    }

    // Default Custom Integration
    return <GenericModal onClose={closeModal} />;
  };

  return (
    <div className={styles.container}>
      <IntegrationsHeader
        connectedCount={connectedProviders.length}
        searchQuery={searchQuery}
        filter={filter}
        onSearchChange={setSearchQuery}
        onFilterChange={setFilter}
      />

      <IntegrationsGrid items={filteredIntegrations} onOpenModal={openAppModal} />

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
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            {renderModalContent()}
          </div>
        </div>
      )}
    </div>
  );
}
