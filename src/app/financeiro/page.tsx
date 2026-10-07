'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3, Building2, ClipboardList, FileSpreadsheet, Package, ShoppingBag, Store, Wallet,
} from 'lucide-react';
import styles from './financeiro.module.css';
import { useAuth } from '@/context/AuthContext';
import { finRequest, currentMonth } from './api';
import type { FinSale, FinWorkspace } from '@/lib/finance/types';
import OverviewTab from './components/OverviewTab';
import ProductsTab from './components/ProductsTab';
import IngredientsTab from './components/IngredientsTab';
import CostsTab from './components/CostsTab';
import SalesTab from './components/SalesTab';
import ImportTab from './components/ImportTab';
import BusinessTab from './components/BusinessTab';
import type { TabProps } from './components/shared';

type TabId = 'overview' | 'products' | 'ingredients' | 'costs' | 'sales' | 'import' | 'business';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Resultado', icon: BarChart3 },
  { id: 'products', label: 'Fichas técnicas', icon: ClipboardList },
  { id: 'ingredients', label: 'Insumos', icon: Package },
  { id: 'costs', label: 'Despesas e canais', icon: Wallet },
  { id: 'sales', label: 'Vendas', icon: ShoppingBag },
  { id: 'import', label: 'Importar planilha', icon: FileSpreadsheet },
  { id: 'business', label: 'Meu negócio', icon: Store },
];

const TENANT_KEY = 'vortice-financeiro-tenant';


export default function FinanceiroPage() {
  const { user } = useAuth();
  // Só a equipe da plataforma escolhe a empresa; os demais veem a própria.
  const isClient = !user?.workspace?.is_platform;

  const [tab, setTab] = useState<TabId>('overview');
  const [tenants, setTenants] = useState<{ id: string; name: string; status: string }[] | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<FinWorkspace | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [month, setMonth] = useState(currentMonth);
  const [sales, setSales] = useState<FinSale[] | null>(null);

  // Equipe Vórtice: escolhe a empresa cliente (lembra a última no navegador).
  useEffect(() => {
    if (!user || isClient) return;
    finRequest<{ id: string; name: string; status: string }[]>('/tenants', null)
      .then((list) => {
        setTenants(list);
        let saved: string | null = null;
        try { saved = localStorage.getItem(TENANT_KEY); } catch { /* sem storage */ }
        const pick = list.find((tenant) => tenant.id === saved) || list[0];
        setTenantId(pick ? pick.id : null);
        if (!pick) setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [user, isClient]);

  const ready = isClient || Boolean(tenantId);

  const reload = useCallback(async () => {
    if (!ready) return;
    try {
      setWorkspace(await finRequest<FinWorkspace>('', tenantId));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [ready, tenantId]);

  const reloadSales = useCallback(async () => {
    if (!ready) return;
    try {
      setSales(await finRequest<FinSale[]>('/sales', tenantId, { query: { month } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar vendas.');
    }
  }, [ready, tenantId, month]);

  useEffect(() => {
    setLoading(true);
    setWorkspace(null);
    reload();
  }, [reload]);

  useEffect(() => {
    setSales(null);
    reloadSales();
  }, [reloadSales]);

  const chooseTenant = (id: string) => {
    setTenantId(id);
    try { localStorage.setItem(TENANT_KEY, id); } catch { /* sem storage */ }
  };

  const tabProps: TabProps | null = useMemo(
    () => (workspace ? { workspace, tenantId, setWorkspace, reload, onNavigate: (id: string) => setTab(id as TabId) } : null),
    [workspace, tenantId, reload]
  );

  const afterSalesChange = useCallback(async () => {
    await Promise.all([reloadSales(), reload()]);
  }, [reloadSales, reload]);

  if (!isClient && tenants && tenants.length === 0) {
    return (
      <div className={styles.container}>
        <Header />
        <div className={`${styles.panel} ${styles.empty}`}>
          <Building2 size={32} />
          <p>Nenhuma empresa cliente cadastrada ainda.</p>
          {user?.role === 'ADMIN' && <Link href="/master" className={styles.primaryButton}>Cadastrar no painel Master</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Header>
        {isClient ? (
          user?.workspace && <span className={styles.tenantBadge}><Building2 size={16} /> {user.workspace.tenant_name}</span>
        ) : tenants && tenants.length > 0 ? (
          <label className={styles.tenantBadge}>
            <Building2 size={16} />
            <select
              className={styles.input}
              style={{ border: 'none', padding: 0, background: 'transparent', fontWeight: 600 }}
              value={tenantId || ''}
              onChange={(event) => chooseTenant(event.target.value)}
              aria-label="Empresa cliente"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}{tenant.status !== 'ACTIVE' ? ' (inativa)' : ''}</option>
              ))}
            </select>
          </label>
        ) : null}
      </Header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <nav className={styles.tabs} role="tablist">
        {TABS.filter((item) => (item.id !== 'import' && item.id !== 'business') || workspace?.access.canManage).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} /> {item.id === 'products' ? workspace?.business.terms.products || item.label : item.id === 'ingredients' ? workspace?.business.terms.ingredients || item.label : item.label}
          </button>
        ))}
      </nav>

      {loading || !tabProps ? (
        <div className={styles.center}>{loading ? 'Carregando a planilha…' : 'Sem dados.'}</div>
      ) : tab === 'overview' ? (
        <OverviewTab {...tabProps} month={month} onMonthChange={setMonth} sales={sales} onNavigate={(id) => setTab(id as TabId)} />
      ) : tab === 'products' ? (
        <ProductsTab {...tabProps} />
      ) : tab === 'ingredients' ? (
        <IngredientsTab {...tabProps} />
      ) : tab === 'costs' ? (
        <CostsTab {...tabProps} />
      ) : tab === 'sales' ? (
        <SalesTab {...tabProps} month={month} onMonthChange={setMonth} sales={sales} onChanged={afterSalesChange} />
      ) : tab === 'business' ? (
        <BusinessTab key={workspace?.tenant.id} {...tabProps} />
      ) : (
        <ImportTab {...tabProps} onSalesImported={afterSalesChange} />
      )}
    </div>
  );
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>Custos e Precificação</h1>
        <p className={styles.subtitle}>
          Custo de cada produto ou serviço, preço certo em cada canal e quanto sobra de lucro no fim do mês.
        </p>
      </div>
      <div className={styles.headerActions}>
        {children}
      </div>
    </header>
  );
}
