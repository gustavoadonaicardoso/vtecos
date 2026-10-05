import { useCallback, useEffect, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import styles from '../users.module.css';
import { supabase } from '@/lib/supabase';
import type { Member } from '../constants';

interface Activity {
  id: string;
  user_name: string;
  action: string;
  target: string | null;
  created_at: string;
}

/**
 * Atividades registradas para o membro: aparecem em "Suas atividades" no
 * Início dele e em "Atualizações recentes" para administradores e gerentes.
 */
export default function ActivityTab({ member, canEdit }: { member: Member; canEdit: boolean }) {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fetchItems = useCallback(async () => {
    if (!supabase) return { items: [] as Activity[] };
    // Registros antigos só tinham o nome (sem user_id): entram também.
    const columns = 'id, user_name, action, target, created_at';
    const [byId, byName] = await Promise.all([
      supabase.from('system_updates').select(columns).eq('user_id', member.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('system_updates').select(columns).is('user_id', null).eq('user_name', member.name).order('created_at', { ascending: false }).limit(30),
    ]);
    if (byId.error) return { error: 'Não foi possível carregar as atividades.' };
    const merged = [...(byId.data || []), ...(byName.data || [])] as Activity[];
    return { items: merged.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30) };
  }, [member.id, member.name]);

  const apply = (result: { items?: Activity[]; error?: string }) => {
    if (result.items) setItems(result.items);
    setError(result.error || '');
  };

  useEffect(() => {
    fetchItems().then(apply);
  }, [fetchItems]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !action.trim()) return;
    setBusy(true);
    const { error: insertError } = await supabase.from('system_updates').insert([{
      user_id: member.id,
      user_name: member.name,
      action: action.trim(),
      target: target.trim() || null,
      icon_name: 'TrendingUp',
    }]);
    setBusy(false);
    if (insertError) {
      setError('Não foi possível registrar.');
      return;
    }
    setAction('');
    setTarget('');
    apply(await fetchItems());
  };

  const remove = async (id: string) => {
    if (!supabase || !confirm('Apagar esta atividade?')) return;
    await supabase.from('system_updates').delete().eq('id', id);
    apply(await fetchItems());
  };

  return (
    <div className={styles.activity}>
      {canEdit && (
        <form className={styles.activityForm} onSubmit={submit}>
          <p className={styles.muted}>Registre algo que {member.name.split(' ')[0]} fez. Aparece no Início dela e em &quot;Atualizações recentes&quot; para administradores e gerentes.</p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>O que foi feito</span>
              <input className={styles.input} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ex.: fechou a venda com" maxLength={140} required />
            </label>
            <label className={styles.field}>
              <span>Com quem / onde (opcional)</span>
              <input className={styles.input} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Ex.: Padaria Central" maxLength={140} />
            </label>
          </div>
          {action.trim() && <p className={styles.preview}>Vai aparecer assim: <strong>{member.name}</strong> {action.trim()} {target.trim()}</p>}
          <button type="submit" className={styles.primaryBtn} disabled={busy || !action.trim()}>
            {busy ? <Loader2 size={15} className={styles.spin} /> : <Send size={15} />} Registrar
          </button>
        </form>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}
      {!items && !error && <p className={styles.muted}><Loader2 size={14} className={styles.spin} /> Carregando...</p>}
      {items && items.length === 0 && <p className={styles.muted}>Nenhuma atividade registrada para esta pessoa.</p>}

      {items && items.length > 0 && (
        <ul className={styles.activityList}>
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <p><strong>{item.user_name}</strong> {item.action} {item.target || ''}</p>
                <small>{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
              </div>
              {canEdit && <button type="button" className={styles.iconBtn} onClick={() => remove(item.id)} aria-label="Apagar atividade"><Trash2 size={14} /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
