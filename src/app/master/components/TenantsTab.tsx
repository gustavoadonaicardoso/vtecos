'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Check, ChevronDown, ChevronUp, KeyRound, Layers, Pencil, Plus, Trash2, UserPlus, X,
} from 'lucide-react';
import styles from './TenantsTab.module.css';
import { PLAN_MODULES, moduleByKey } from '@/lib/plans';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  modules: string[];
  active: boolean;
  tenant_count?: number;
}

interface Tenant {
  id: string;
  name: string;
  status: string;
  is_platform?: boolean;
  plan_id: string | null;
  document?: string | null;
  contact_email?: string | null;
  notes?: string | null;
  created_at: string;
  user_count?: number;
}

interface ClientUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'SELLER';
  status: 'ACTIVE' | 'INACTIVE';
}

const ROLE_LABEL: Record<ClientUser['role'], string> = {
  ADMIN: 'Dono / Administrador',
  MANAGER: 'Gerente',
  SELLER: 'Vendedor / Atendente',
};

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Ativa', INACTIVE: 'Inativa', SUSPENDED: 'Suspensa' };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const EMPTY_PLAN = { name: '', description: '', price: '', modules: ['crm'] as string[], active: true };
const EMPTY_TENANT = { name: '', plan_id: '', adminName: '', adminEmail: '', adminPassword: '' };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Não foi possível concluir.');
  return json.data as T;
}

export default function TenantsTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [planForm, setPlanForm] = useState<typeof EMPTY_PLAN & { id?: string } | null>(null);
  const [newTenant, setNewTenant] = useState(EMPTY_TENANT);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tenantForm, setTenantForm] = useState<{ id: string; name: string; document: string; contact_email: string; notes: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planList, tenantList] = await Promise.all([request<Plan[]>('/api/plans'), request<Tenant[]>('/api/tenants')]);
      setPlans(planList);
      setTenants(tenantList);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const planName = useMemo(() => new Map(plans.map((plan) => [plan.id, plan.name])), [plans]);

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!planForm) return;
    try {
      const body = JSON.stringify({ ...planForm, price: Number(String(planForm.price).replace(',', '.')) || 0 });
      if (planForm.id) {
        const updated = await request<Plan>(`/api/plans/${planForm.id}`, { method: 'PUT', body });
        setPlans((list) => list.map((plan) => (plan.id === updated.id ? { ...updated, tenant_count: plan.tenant_count } : plan)));
      } else {
        const created = await request<Plan>('/api/plans', { method: 'POST', body });
        setPlans((list) => [...list, created]);
      }
      setPlanForm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar o plano.');
    }
  };

  const removePlan = async (plan: Plan) => {
    const warning = plan.tenant_count ? `\n${plan.tenant_count} empresa(s) ficarão sem plano.` : '';
    if (!confirm(`Excluir o plano "${plan.name}"?${warning}`)) return;
    try {
      await request(`/api/plans/${plan.id}`, { method: 'DELETE' });
      setPlans((list) => list.filter((item) => item.id !== plan.id));
      setTenants((list) => list.map((tenant) => (tenant.plan_id === plan.id ? { ...tenant, plan_id: null } : tenant)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir.');
    }
  };

  const createTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTenant.name.trim()) return;
    setCreating(true);
    try {
      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTenant.name,
          plan_id: newTenant.plan_id || null,
          admin: newTenant.adminEmail ? { name: newTenant.adminName, email: newTenant.adminEmail, password: newTenant.adminPassword } : null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Erro ao criar empresa.');
      if (json.warning) alert(json.warning);
      setNewTenant(EMPTY_TENANT);
      setExpanded(json.data.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar empresa.');
    } finally {
      setCreating(false);
    }
  };

  const patchTenant = async (tenant: Pick<Tenant, 'id'>, changes: Partial<Tenant>) => {
    try {
      const updated = await request<Tenant>(`/api/tenants/${tenant.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setTenants((list) => list.map((item) => (item.id === tenant.id ? { ...item, ...updated } : item)));
      if ('plan_id' in changes) load();
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar empresa.');
      return false;
    }
  };

  const saveTenantData = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantForm) return;
    const { id, ...changes } = tenantForm;
    if (await patchTenant({ id }, changes)) setTenantForm(null);
  };

  const toggleModule = (key: string) => {
    setPlanForm((form) => form && ({
      ...form,
      modules: form.modules.includes(key) ? form.modules.filter((item) => item !== key) : [...form.modules, key],
    }));
  };

  return (
    <motion.div key="tenants" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={styles.wrap}>
      {error && <div className={styles.error}>{error} — confira se a migration 202610040001 já rodou no Supabase.</div>}

      {/* ── Planos ───────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2><Layers size={18} /> Planos de assinatura</h2>
            <p>O plano define quais módulos aparecem para a empresa. Cada empresa trabalha só com os próprios dados: leads, conversas, WhatsApp, equipe e configurações.</p>
          </div>
          <button className={styles.primary} onClick={() => setPlanForm({ ...EMPTY_PLAN })}><Plus size={16} /> Novo plano</button>
        </div>

        {loading && plans.length === 0 ? (
          <p className={styles.muted}>Carregando…</p>
        ) : plans.length === 0 ? (
          <p className={styles.muted}>Nenhum plano ainda. Crie o primeiro (ex.: “Gestão Financeira”).</p>
        ) : (
          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <article key={plan.id} className={`${styles.plan} ${plan.active ? '' : styles.planInactive}`}>
                <header>
                  <div>
                    <h3>{plan.name}</h3>
                    <span className={styles.price}>{money(plan.price)}<small>/mês</small></span>
                  </div>
                  <div className={styles.rowActions}>
                    <button className={styles.icon} title="Editar" onClick={() => setPlanForm({ ...plan, price: String(plan.price) })}><Pencil size={15} /></button>
                    <button className={`${styles.icon} ${styles.iconDanger}`} title="Excluir" onClick={() => removePlan(plan)}><Trash2 size={15} /></button>
                  </div>
                </header>
                {plan.description && <p className={styles.muted}>{plan.description}</p>}
                <div className={styles.chips}>
                  {plan.modules.map((key) => {
                    const item = moduleByKey(key);
                    return item ? (
                      <span key={key} className={`${styles.chip} ${styles.chipClient}`}>{item.label}</span>
                    ) : null;
                  })}
                  {plan.modules.length === 0 && <span className={styles.muted}>Sem módulos</span>}
                </div>
                <footer className={styles.muted}>
                  {plan.tenant_count || 0} empresa(s){plan.active ? '' : ' · plano inativo'}
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── Empresas ─────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2><Building2 size={18} /> Empresas clientes</h2>
            <p>Crie a empresa já com o administrador dela: ele entra no sistema e cadastra a própria equipe em “Equipe”. Cada empresa enxerga só os próprios dados.</p>
          </div>
        </div>

        <form onSubmit={createTenant} className={styles.createForm}>
          <div className={styles.inlineForm}>
            <input
              className={styles.input}
              value={newTenant.name}
              onChange={(event) => setNewTenant((form) => ({ ...form, name: event.target.value }))}
              placeholder="Nome da empresa (ex.: Doces da Ana)"
              required
            />
            <select className={styles.input} value={newTenant.plan_id} onChange={(event) => setNewTenant((form) => ({ ...form, plan_id: event.target.value }))}>
              <option value="">Sem plano</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </div>
          <div className={styles.adminRow}>
            <span className={styles.muted}>Administrador da empresa (opcional, dá pra criar depois em “Acessos”)</span>
            <input className={styles.input} placeholder="Nome" value={newTenant.adminName} onChange={(event) => setNewTenant((form) => ({ ...form, adminName: event.target.value }))} />
            <input className={styles.input} type="email" placeholder="E-mail de login" value={newTenant.adminEmail} onChange={(event) => setNewTenant((form) => ({ ...form, adminEmail: event.target.value }))} />
            <input className={styles.input} type="text" placeholder="Senha inicial (8+)" value={newTenant.adminPassword} onChange={(event) => setNewTenant((form) => ({ ...form, adminPassword: event.target.value }))} />
            <button type="submit" className={styles.primary} disabled={creating}><Plus size={16} /> {creating ? 'Criando…' : 'Criar empresa'}</button>
          </div>
        </form>

        <div className={styles.tenantList}>
          {tenants.map((tenant) => (
            <div key={tenant.id} className={styles.tenant}>
              <div className={styles.tenantRow}>
                <div className={styles.tenantName}>
                  <strong>{tenant.name} {tenant.is_platform && <span className={`${styles.chip} ${styles.chipClient}`}>plataforma</span>}</strong>
                  <span className={styles.muted}>{tenant.user_count || 0} acesso(s) · desde {new Date(tenant.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <label className={styles.inlineField}>
                  <span>Plano</span>
                  <select className={styles.input} value={tenant.is_platform ? '' : tenant.plan_id || ''} disabled={tenant.is_platform} onChange={(event) => patchTenant(tenant, { plan_id: event.target.value || null })}>
                    <option value="">{tenant.is_platform ? 'Todos os módulos' : 'Sem plano'}</option>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </label>
                <label className={styles.inlineField}>
                  <span>Status</span>
                  <select
                    className={`${styles.input} ${tenant.status === 'ACTIVE' ? styles.ok : styles.bad}`}
                    value={tenant.status}
                    disabled={tenant.is_platform}
                    onChange={(event) => patchTenant(tenant, { status: event.target.value })}
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <div className={styles.rowActions}>
                  <button
                    className={styles.icon}
                    title="Editar dados da empresa"
                    onClick={() => setTenantForm({
                      id: tenant.id,
                      name: tenant.name,
                      document: tenant.document || '',
                      contact_email: tenant.contact_email || '',
                      notes: tenant.notes || '',
                    })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button className={styles.secondary} onClick={() => setExpanded(expanded === tenant.id ? null : tenant.id)}>
                    <KeyRound size={15} /> Acessos {expanded === tenant.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>
              {(tenant.document || tenant.contact_email) && (
                <p className={styles.muted} style={{ margin: 0 }}>
                  {[tenant.document && `CNPJ/CPF ${tenant.document}`, tenant.contact_email].filter(Boolean).join(' · ')}
                </p>
              )}
              {!tenant.plan_id && !tenant.is_platform && <p className={styles.warn}>Sem plano: os usuários desta empresa só veem Início, Equipe e Ajuda.</p>}
              {tenant.plan_id && planName.get(tenant.plan_id) === undefined && <p className={styles.warn}>Plano não encontrado.</p>}
              {expanded === tenant.id && <TenantUsers tenant={tenant} onChanged={load} />}
            </div>
          ))}
          {!loading && tenants.length === 0 && <p className={styles.muted}>Nenhuma empresa cadastrada.</p>}
        </div>
      </section>

      {tenantForm && (
        <div className={styles.overlay} onClick={() => setTenantForm(null)}>
          <form className={styles.modal} onClick={(event) => event.stopPropagation()} onSubmit={saveTenantData}>
            <div className={styles.modalHead}>
              <h3>Dados da empresa</h3>
              <button type="button" className={styles.icon} onClick={() => setTenantForm(null)} aria-label="Fechar"><X size={16} /></button>
            </div>
            <label className={styles.field}>
              <span>Nome</span>
              <input className={styles.input} value={tenantForm.name} maxLength={120} onChange={(event) => setTenantForm({ ...tenantForm, name: event.target.value })} required autoFocus />
            </label>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>E-mail de contato</span>
                <input className={styles.input} type="email" value={tenantForm.contact_email} onChange={(event) => setTenantForm({ ...tenantForm, contact_email: event.target.value })} placeholder="financeiro@empresa.com" />
              </label>
              <label className={styles.field}>
                <span>CNPJ / CPF</span>
                <input className={styles.input} value={tenantForm.document} maxLength={20} onChange={(event) => setTenantForm({ ...tenantForm, document: event.target.value })} placeholder="00.000.000/0001-00" />
              </label>
            </div>
            <label className={styles.field}>
              <span>Observações internas</span>
              <textarea className={styles.input} rows={3} maxLength={500} value={tenantForm.notes} onChange={(event) => setTenantForm({ ...tenantForm, notes: event.target.value })} placeholder="Ex.: vencimento todo dia 10, contato com a Ana" />
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondary} onClick={() => setTenantForm(null)}>Cancelar</button>
              <button type="submit" className={styles.primary}>Salvar dados</button>
            </div>
          </form>
        </div>
      )}

      {planForm && (
        <div className={styles.overlay} onClick={() => setPlanForm(null)}>
          <form className={styles.modal} onClick={(event) => event.stopPropagation()} onSubmit={savePlan}>
            <div className={styles.modalHead}>
              <h3>{planForm.id ? 'Editar plano' : 'Novo plano'}</h3>
              <button type="button" className={styles.icon} onClick={() => setPlanForm(null)}><X size={16} /></button>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Nome</span>
                <input className={styles.input} value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} required autoFocus />
              </label>
              <label className={styles.field}>
                <span>Preço mensal (R$)</span>
                <input className={styles.input} inputMode="decimal" value={planForm.price} onChange={(event) => setPlanForm({ ...planForm, price: event.target.value })} placeholder="0,00" />
              </label>
            </div>
            <label className={styles.field}>
              <span>Descrição</span>
              <textarea className={styles.input} rows={2} value={planForm.description} onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })} />
            </label>
            <div className={styles.field}>
              <span>Módulos incluídos</span>
              <div className={styles.moduleList}>
                {PLAN_MODULES.map((item) => {
                  const checked = planForm.modules.includes(item.key);
                  return (
                    <button type="button" key={item.key} className={`${styles.moduleOption} ${checked ? styles.moduleChecked : ''}`} onClick={() => toggleModule(item.key)}>
                      <span className={styles.check}>{checked && <Check size={13} />}</span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className={styles.toggle}>
              <input type="checkbox" checked={planForm.active} onChange={(event) => setPlanForm({ ...planForm, active: event.target.checked })} />
              Plano ativo (desativado, as empresas dele perdem o acesso aos módulos)
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondary} onClick={() => setPlanForm(null)}>Cancelar</button>
              <button type="submit" className={styles.primary}>Salvar plano</button>
            </div>
          </form>
        </div>
      )}
    </motion.div>
  );
}

function TenantUsers({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
  const [users, setUsers] = useState<ClientUser[] | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ADMIN' });
  const [saving, setSaving] = useState(false);
  const base = `/api/tenants/${tenant.id}/users`;

  useEffect(() => {
    request<ClientUser[]>(base).then(setUsers).catch(() => setUsers([]));
  }, [base]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await request<ClientUser>(base, { method: 'POST', body: JSON.stringify(form) });
      setUsers((list) => [...(list || []), created]);
      setForm({ name: '', email: '', password: '', role: 'ADMIN' });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar acesso.');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (user: ClientUser, changes: Partial<ClientUser>) => {
    try {
      const updated = await request<ClientUser>(`${base}/${user.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      setUsers((list) => (list || []).map((item) => (item.id === user.id ? { ...item, ...updated } : item)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar.');
    }
  };

  const resetPassword = async (user: ClientUser) => {
    const newPassword = prompt(`Nova senha para ${user.name} (mínimo 8 caracteres):`);
    if (!newPassword) return;
    try {
      await request(`${base}/${user.id}`, { method: 'PATCH', body: JSON.stringify({ password: newPassword }) });
      alert('Senha redefinida.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    }
  };

  const remove = async (user: ClientUser) => {
    if (!confirm(`Remover o acesso de ${user.name}?`)) return;
    try {
      await request(`${base}/${user.id}`, { method: 'DELETE' });
      setUsers((list) => (list || []).filter((item) => item.id !== user.id));
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover.');
    }
  };

  return (
    <div className={styles.users}>
      {users === null ? (
        <p className={styles.muted}>Carregando acessos…</p>
      ) : users.length === 0 ? (
        <p className={styles.muted}>Nenhum login para esta empresa ainda.</p>
      ) : (
        <ul className={styles.userList}>
          {users.map((user) => (
            <li key={user.id}>
              <div>
                <strong>{user.name}</strong>
                <span className={styles.muted}>{user.email}</span>
              </div>
              <select className={styles.input} value={user.role} onChange={(event) => patch(user, { role: event.target.value as ClientUser['role'] })}>
                {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button
                className={`${styles.secondary} ${user.status === 'ACTIVE' ? styles.ok : styles.bad}`}
                onClick={() => patch(user, { status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
              >
                {user.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
              </button>
              <button className={styles.icon} title="Redefinir senha" onClick={() => resetPassword(user)}><KeyRound size={15} /></button>
              <button className={`${styles.icon} ${styles.iconDanger}`} title="Remover acesso" onClick={() => remove(user)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.userForm} onSubmit={create}>
        <input className={styles.input} placeholder="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input className={styles.input} type="email" placeholder="E-mail de login" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <input className={styles.input} type="text" placeholder="Senha inicial (8+)" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        <select className={styles.input} value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="submit" className={styles.primary} disabled={saving}><UserPlus size={16} /> {saving ? 'Criando…' : 'Criar acesso'}</button>
      </form>
    </div>
  );
}
