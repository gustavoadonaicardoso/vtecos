'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Loader2, Plus, Search, UserCog, X } from 'lucide-react';
import styles from './users.module.css';
import { useAuth } from '@/context/AuthContext';
import { usePresence } from '@/context/PresenceContext';
import { editablePermissions, ROLE_LABEL, type Member, type Role, type Template } from './constants';
import Avatar from './components/Avatar';
import MemberDetail, { type Draft } from './components/MemberDetail';
import NewMemberModal from './components/NewMemberModal';
import RemoveMemberModal from './components/RemoveMemberModal';

type Notice = { type: 'ok' | 'error'; text: string };

const toDraft = (member: Member): Draft => ({
  name: member.name,
  email: member.email,
  role: member.role,
  status: member.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  permissions: editablePermissions(member.permissions),
  allowed_templates: member.allowed_templates || [],
});

async function loadTeam() {
  const response = await fetch('/api/users?scope=team', { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  return response.ok
    ? { members: (json.data || []) as Member[], templates: (json.templates || []) as Template[] }
    : { error: json.error || 'Não foi possível carregar a equipe.' };
}

export default function UsersPage() {
  const { user } = useAuth();
  const presence = usePresence();
  const canEdit = user?.role === 'ADMIN';
  // Empresa da plataforma tem todos os módulos: null = não filtra.
  const modules = user?.workspace?.is_platform ? null : user?.workspace?.modules ?? null;

  const [members, setMembers] = useState<Member[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role | 'INACTIVE'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<'data' | 'access' | 'activity'>('data');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);

  const selected = members?.find((member) => member.id === selectedId) || null;
  const dirty = Boolean(selected && draft && JSON.stringify(draft) !== JSON.stringify(toDraft(selected)));

  const apply = useCallback((result: Awaited<ReturnType<typeof loadTeam>>, keepId?: string | null) => {
    if ('error' in result) {
      setLoadError(result.error || '');
      return;
    }
    setLoadError('');
    setMembers(result.members);
    setTemplates(result.templates);
    const nextId = keepId && result.members.some((member) => member.id === keepId) ? keepId : result.members[0]?.id ?? null;
    setSelectedId(nextId);
    const next = result.members.find((member) => member.id === nextId);
    setDraft(next ? toDraft(next) : null);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadTeam().then((result) => apply(result, null));
  }, [user, apply]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Avisa antes de sair da página com alterações sem salvar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const select = (member: Member) => {
    if (member.id !== selectedId && dirty && !confirm('Descartar as alterações não salvas deste membro?')) return;
    setSelectedId(member.id);
    setDraft(toDraft(member));
    setMobileDetail(true);
  };

  const save = async () => {
    if (!selected || !draft) return;
    if (!draft.name.trim() || !draft.email.trim()) {
      setNotice({ type: 'error', text: 'Nome e e-mail são obrigatórios.' });
      return;
    }
    setSaving(true);
    const response = await fetch(`/api/users/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, name: draft.name.trim(), email: draft.email.trim() }),
    });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setNotice({ type: 'error', text: json.error || 'Não foi possível salvar.' });
      return;
    }
    setNotice({ type: 'ok', text: `${draft.name.split(' ')[0]} atualizado(a). As mudanças de acesso valem no próximo carregamento da página dele(a).` });
    apply(await loadTeam(), selected.id);
  };

  const deactivate = async () => {
    if (!selected || !draft) return;
    setRemoving(false);
    const response = await fetch(`/api/users/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...toDraft(selected), status: 'INACTIVE' }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) setNotice({ type: 'error', text: json.error || 'Não foi possível desativar.' });
    else setNotice({ type: 'ok', text: `${selected.name} foi desativado(a): não consegue mais entrar.` });
    apply(await loadTeam(), selected.id);
  };

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (members || []).filter((member) => {
      if (roleFilter === 'INACTIVE' ? member.status !== 'INACTIVE' : roleFilter !== 'all' && (member.role !== roleFilter || member.status === 'INACTIVE')) return false;
      return !text || member.name.toLowerCase().includes(text) || member.email.toLowerCase().includes(text);
    });
  }, [members, query, roleFilter]);

  const counts = useMemo(() => {
    const list = members || [];
    return {
      all: list.length,
      ADMIN: list.filter((member) => member.role === 'ADMIN' && member.status !== 'INACTIVE').length,
      MANAGER: list.filter((member) => member.role === 'MANAGER' && member.status !== 'INACTIVE').length,
      SELLER: list.filter((member) => member.role === 'SELLER' && member.status !== 'INACTIVE').length,
      INACTIVE: list.filter((member) => member.status === 'INACTIVE').length,
      online: list.filter((member) => member.status !== 'INACTIVE' && presence.isOnline(member.id, member.last_seen_at)).length,
    };
  }, [members, presence]);

  const copyCredentials = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`Acesso ao sistema\nE-mail: ${credentials.email}\nSenha: ${credentials.password}\nEndereço: ${window.location.origin}/login`);
      setNotice({ type: 'ok', text: 'Dados de acesso copiados.' });
    } catch {}
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h2>Equipe</h2>
          <p>
            {members ? `${counts.all} pessoa(s) · ${counts.online} online agora` : 'Carregando...'}
            {counts.INACTIVE > 0 && ` · ${counts.INACTIVE} inativa(s)`}
          </p>
        </div>
        {canEdit && (
          <button type="button" className={styles.primaryBtn} onClick={() => setCreating(true)}>
            <Plus size={16} /> Novo membro
          </button>
        )}
      </header>

      {!canEdit && user && (
        <div className={styles.infoBanner}>
          <UserCog size={16} /> Você pode ver a equipe e os acessos de cada pessoa. Só administradores cadastram e editam.
        </div>
      )}

      {credentials && (
        <div className={styles.credentials}>
          <CheckCircle2 size={18} />
          <div>
            <strong>{credentials.name} foi cadastrado(a).</strong>
            <p>E-mail: <code>{credentials.email}</code> · Senha: <code>{credentials.password}</code></p>
            <small>Esta é a única vez que a senha aparece. Envie para a pessoa por um canal seguro.</small>
          </div>
          <button type="button" className={styles.secondaryBtn} onClick={copyCredentials}><Copy size={14} /> Copiar</button>
          <button type="button" className={styles.iconBtn} onClick={() => setCredentials(null)} aria-label="Fechar"><X size={16} /></button>
        </div>
      )}

      {loadError && <div className={styles.errorBox}><AlertTriangle size={16} /> {loadError}</div>}

      <div className={`${styles.layout} ${mobileDetail ? styles.showDetail : ''}`}>
        <aside className={styles.listPanel} aria-label="Membros">
          <label className={styles.search}>
            <Search size={15} />
            <input type="search" placeholder="Buscar por nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className={styles.filters} role="tablist" aria-label="Filtrar">
            {([['all', 'Todos'], ['ADMIN', 'Admins'], ['MANAGER', 'Gerentes'], ['SELLER', 'Vendedores'], ['INACTIVE', 'Inativos']] as const).map(([value, label]) => (
              (value === 'all' || counts[value] > 0) && (
                <button key={value} type="button" role="tab" aria-selected={roleFilter === value} className={roleFilter === value ? styles.filterOn : ''} onClick={() => setRoleFilter(value)}>
                  {label} <span>{counts[value]}</span>
                </button>
              )
            ))}
          </div>

          <div className={styles.memberList}>
            {!members && !loadError && <p className={styles.muted}><Loader2 size={14} className={styles.spin} /> Carregando equipe...</p>}
            {members && filtered.length === 0 && <p className={styles.muted}>Ninguém encontrado.</p>}
            {filtered.map((member) => {
              const active = member.status !== 'INACTIVE';
              const online = active && presence.isOnline(member.id, member.last_seen_at);
              return (
                <button key={member.id} type="button" className={`${styles.memberItem} ${member.id === selectedId ? styles.memberOn : ''} ${active ? '' : styles.memberOff}`} onClick={() => select(member)}>
                  <Avatar id={member.id} name={member.name} url={member.avatar_url} size={40} online={active ? online : undefined} />
                  <span className={styles.memberText}>
                    <strong>{member.name}{member.id === user?.id && <span className={styles.youTag}>você</span>}</strong>
                    <small>{ROLE_LABEL[member.role] || member.role} · {active ? presence.statusLabel(member.id, member.last_seen_at) : 'Inativo'}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={styles.detailPanel}>
          {selected && draft ? (
            <MemberDetail
              key={selected.id}
              member={selected}
              draft={draft}
              dirty={dirty}
              saving={saving}
              canEdit={canEdit}
              isSelf={selected.id === user?.id}
              online={presence.isOnline(selected.id, selected.last_seen_at)}
              presenceLabel={presence.statusLabel(selected.id, selected.last_seen_at)}
              modules={modules}
              templates={templates}
              tab={tab}
              onTab={setTab}
              onDraft={(changes) => setDraft((current) => (current ? { ...current, ...changes } : current))}
              onSave={save}
              onDiscard={() => setDraft(toDraft(selected))}
              onBack={() => {
                if (dirty && !confirm('Descartar as alterações não salvas?')) return;
                setDraft(toDraft(selected));
                setMobileDetail(false);
              }}
              onRemove={() => setRemoving(true)}
              onNotice={(type, text) => setNotice({ type, text })}
            />
          ) : (
            members && <div className={styles.emptyDetail}><UserCog size={32} /><p>Escolha alguém da lista.</p></div>
          )}
        </main>
      </div>

      {creating && (
        <NewMemberModal
          modules={modules}
          onClose={() => setCreating(false)}
          onCreated={async (created) => {
            setCreating(false);
            setCredentials(created);
            apply(await loadTeam(), created.id);
            setTab('data');
          }}
        />
      )}

      {removing && selected && (
        <RemoveMemberModal
          member={selected}
          candidates={(members || []).filter((member) => member.id !== selected.id && member.status !== 'INACTIVE')}
          onClose={() => setRemoving(false)}
          onDeactivate={deactivate}
          onRemoved={async () => {
            setRemoving(false);
            setMobileDetail(false);
            setNotice({ type: 'ok', text: `${selected.name} foi removido(a) da equipe.` });
            apply(await loadTeam(), null);
          }}
        />
      )}

      {notice && (
        <div className={`${styles.toast} ${notice.type === 'error' ? styles.toastError : ''}`} role="status">
          {notice.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {notice.text}
        </div>
      )}
    </div>
  );
}
