"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, BookOpen, CheckCircle2, Circle, Loader2, Lock, Search, Server } from 'lucide-react';
import styles from './integrations.module.css';
import { useAuth } from '@/context/AuthContext';
import { CATALOG, CATEGORIES, type CardStatus, type CatalogItem, type DeliveryInfo, type Overview } from './constants';
import IntegrationModal from './components/IntegrationModal';

const STATUS_LABEL: Record<CardStatus, string> = { connected: 'Conectado', attention: 'Atenção', off: 'Não configurado' };

function statusOf(item: CatalogItem, overview: Overview): { status: CardStatus; detail: string } {
  if (item.id === 'whatsapp-web') {
    const web = overview.whatsappWeb;
    if (web?.connected) return { status: 'connected', detail: web.phone ? `Número ${web.phone}` : 'Sessão ativa' };
    return { status: 'off', detail: 'Leia o QR Code para conectar' };
  }
  if (item.id === 'social') {
    const count = overview.socialAccounts ?? 0;
    return count > 0 ? { status: 'connected', detail: `${count} conta(s) conectada(s)` } : { status: 'off', detail: 'Conecte em Redes Sociais > Contas' };
  }
  const integration = overview.integrations.find((row) => row.provider === item.provider);
  if (item.id === 'ai') {
    if (integration) return { status: 'connected', detail: 'Usando a sua chave do Gemini' };
    return overview.platformAi ? { status: 'connected', detail: 'Usando a IA da Vórtice' } : { status: 'off', detail: 'Cadastre a sua chave do Gemini' };
  }
  if (item.id === 'twilio') {
    return integration ? { status: 'connected', detail: `Número ${String(integration.config.phoneNumber || '')}` } : { status: 'off', detail: 'Conecte a conta Twilio da empresa' };
  }
  if (!integration) return { status: 'off', detail: 'Ainda não configurado' };
  if (integration.config.enabled === false) return { status: 'attention', detail: 'Desativado' };
  const delivery = integration.config.last_delivery as DeliveryInfo | undefined;
  if (delivery && !delivery.ok) return { status: 'attention', detail: `Último envio falhou: ${delivery.error || 'erro'}` };
  if (item.id === 'whatsapp-api') {
    if (integration.config.source === 'embedded') return { status: 'connected', detail: `Número ${String(integration.config.displayPhone || integration.config.phoneId || '')}` };
    if (!integration.secrets.appSecret) return { status: 'attention', detail: 'Falta a chave secreta do app' };
  }
  return { status: 'connected', detail: delivery ? `Último envio ${new Date(delivery.at).toLocaleString('pt-BR')}` : 'Configurado' };
}

async function fetchOverview(): Promise<{ data?: Overview; error?: string }> {
  try {
    const response = await fetch('/api/integrations', { cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return { error: json.error || 'Não foi possível carregar as integrações.' };
    return { data: json.data };
  } catch {
    return { error: 'Não foi possível carregar as integrações.' };
  }
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const modules = user?.workspace?.modules;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>('Todos');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<CatalogItem['id'] | null>(null);

  const apply = useCallback((result: { data?: Overview; error?: string }) => {
    setError(result.error || '');
    if (result.data) setOverview(result.data);
  }, []);

  const load = useCallback(async () => apply(await fetchOverview()), [apply]);

  useEffect(() => {
    if (isAdmin) fetchOverview().then(apply);
  }, [isAdmin, apply]);

  // Só o que o plano da empresa libera.
  const available = useMemo(() => CATALOG.filter((item) => !modules || modules.includes(item.module)), [modules]);

  const cards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return available
      .filter((item) => filter === 'Todos' || item.category === filter)
      .filter((item) => !term || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(term))
      .map((item) => ({ item, ...(overview ? statusOf(item, overview) : { status: 'off' as CardStatus, detail: '' }) }));
  }, [available, filter, search, overview]);

  const connectedCount = overview ? available.filter((item) => statusOf(item, overview).status === 'connected').length : 0;
  const openItem = available.find((item) => item.id === openId) || null;

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1>Integrações</h1>
            <p>Conexões do sistema com WhatsApp, site, planilhas e outros serviços.</p>
          </div>
        </header>
        <div className={styles.notice}>
          <Lock size={18} />
          <div>
            <strong>Só administradores configuram as integrações.</strong>
            <span>Peça a um administrador da sua empresa. Os tutoriais estão na Central de Ajuda.</span>
          </div>
          <Link href="/help" className={styles.secondaryBtn}><BookOpen size={16} /> Central de Ajuda</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Integrações</h1>
          <p>Conecte o WhatsApp, receba leads do site e envie dados para outros sistemas. Cada integração tem o passo a passo dentro dela.</p>
        </div>
        <div className={styles.stats}>
          <div><strong>{overview ? connectedCount : '–'}</strong><span>conectada(s)</span></div>
          <div><strong>{available.length}</strong><span>disponíveis no seu plano</span></div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={17} />
          <input type="search" placeholder="Buscar integração..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className={styles.filters}>
          {CATEGORIES.map((category) => (
            <button key={category} type="button" className={filter === category ? styles.filterActive : ''} onClick={() => setFilter(category)}>
              {category}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.error}><AlertTriangle size={16} /> <span>{error}</span></div>}
      {!overview && !error && <div className={styles.loading}><Loader2 size={18} className={styles.spin} /> Carregando integrações...</div>}

      {overview && (
        <div className={styles.grid}>
          {cards.map(({ item, status, detail }) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.iconBox} style={{ color: item.color, background: `${item.color}1f` }}><item.icon size={22} /></span>
                <span className={`${styles.pill} ${styles[`pill_${status}`]}`}>
                  {status === 'connected' ? <CheckCircle2 size={12} /> : status === 'attention' ? <AlertTriangle size={12} /> : <Circle size={10} />}
                  {STATUS_LABEL[status]}
                </span>
              </div>
              <div className={styles.cardBody}>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <span className={styles.detail}>{detail}</span>
              </div>
              <div className={styles.cardFoot}>
                <span className={styles.category}>{item.category}</span>
                <button type="button" className={status === 'off' ? styles.primaryBtn : styles.secondaryBtn} onClick={() => setOpenId(item.id)}>
                  {status === 'off' ? 'Conectar' : 'Gerenciar'} <ArrowUpRight size={15} />
                </button>
              </div>
            </article>
          ))}
          {cards.length === 0 && <div className={styles.empty}>Nenhuma integração encontrada.</div>}
        </div>
      )}

      {overview?.platform && (
        <section className={styles.platform}>
          <div className={styles.platformHead}>
            <Server size={18} />
            <div>
              <h2>Serviços da plataforma</h2>
              <p>Configurados uma vez no servidor (arquivo <code>.env.local</code> da VPS) pela Vórtice. Cada empresa conecta as próprias contas nos cartões acima. Só a Vórtice vê este quadro.</p>
            </div>
          </div>
          <div className={styles.platformGrid}>
            {overview.platform.map((service) => (
              <div key={service.key} className={styles.platformItem}>
                <span className={`${styles.pill} ${service.configured ? styles.pill_connected : styles.pill_attention}`}>
                  {service.configured ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {service.configured ? 'Configurado' : 'Faltando'}
                </span>
                <strong>{service.label}</strong>
                <span>{service.description}</span>
                {!service.configured && <code className={styles.missing}>{service.missing.join(', ')}</code>}
              </div>
            ))}
          </div>
          <p className={styles.hint}>Depois de alterar o <code>.env.local</code>, rode o deploy (ou <code>pm2 restart vtec-os</code>) para valer.</p>
        </section>
      )}

      {openItem && overview && (
        <IntegrationModal
          key={openItem.id}
          item={openItem}
          status={statusOf(openItem, overview).status}
          integration={overview.integrations.find((row) => row.provider === openItem.provider) || null}
          overview={overview}
          onChanged={load}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
