import { Search } from 'lucide-react';
import styles from '../users.module.css';

interface UserListSidebarProps {
  users: any[];
  selectedUserId: string | null;
  onSelectUser: (id: string) => void;
}

export default function UserListSidebar({ users, selectedUserId, onSelectUser }: UserListSidebarProps) {
  return (
    <aside className={styles.sidebarSection}>
      <div className={styles.searchBlock}>
        <Search size={16} />
        <input type="text" placeholder="Filtrar equipe..." />
      </div>

      <div className={styles.userList}>
        {users.map(u => (
          <div
            key={u.id}
            className={`${styles.userCard} ${selectedUserId === u.id ? styles.userCardActive : ''}`}
            onClick={() => onSelectUser(u.id)}
          >
            <div className={styles.userAvatarSmall}>
              {u.name.charAt(0)}{u.name.split(' ')[1]?.charAt(0) || ''}
            </div>
            <div className={styles.userMetaCompact}>
              <div className={styles.userNameSmall}>{u.name}</div>
              <div className={styles.userRoleSmall}>{u.role}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
