"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Users,
  Kanban,
  MessageSquare,
  Settings,
  Zap,
  Blocks,
  LifeBuoy,
  ShieldCheck,
  UserCog,
  BarChart3,
  Briefcase,
  Calendar,
  Ticket,
  MessageCircle,
  FileText,
  Megaphone
} from 'lucide-react';
import styles from './Sidebar.module.css';
import { useSidebar } from '@/components/SidebarProvider';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { usePermissions } from '@/lib/permissions';
// Hook centralizado de não lidos — não duplicamos lógica de Realtime aqui
import { useUnreadCount } from '@/hooks/useUnreadCount';


const Sidebar = () => {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar, isMobileOpen, closeMobileMenu } = useSidebar();
  const { user, logout } = useAuth();
  const { config } = useTheme();
  const { hasPermission, isAdmin } = usePermissions();
  const [mounted, setMounted] = React.useState(false);
  // Hook centralizado — toda lógica de Realtime fica em useUnreadCount
  const unreadChatCount = useUnreadCount();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = React.useMemo(() => [
    { name: 'Início', icon: LayoutDashboard, path: '/', permission: 'dashboard.view' },
    { name: 'Projetos', icon: Briefcase, path: '/projetos', permission: 'admin.projects' },
    { name: 'Mensagens', icon: MessageSquare, path: '/messages', permission: 'messages.view' },
    { name: 'Chat Interno', icon: MessageCircle, path: '/chat', permission: 'messages.send' },
    { name: 'Pipeline', icon: Kanban, path: '/pipeline', permission: 'pipeline.view' },
    { name: 'Leads', icon: Users, path: '/leads', permission: 'leads.view' },
    { name: 'Relatórios', icon: BarChart3, path: '/relatorios', permission: 'dashboard.kpis' },
    { name: 'Agendamento', icon: Calendar, path: '/scheduling', permission: 'integrations.view' },
    { name: 'Senhas', icon: Ticket, path: '/queue', permission: 'integrations.view' },
    { name: 'Notas Fiscais', icon: FileText, path: '/fiscal', permission: 'integrations.view' },
    { name: 'Disparos', icon: Megaphone, path: '/disparos', permission: 'messages.send' },
    
    { name: 'Equipe', icon: UserCog, path: '/users', permission: 'team.view' },
    { name: 'Automações', icon: Zap, path: '/automations', permission: 'automations.view' },
    { name: 'Integrações', icon: Blocks, path: '/integrations', permission: 'integrations.view' },
    { name: 'Central de Ajuda', icon: LifeBuoy, path: '/help' }, // Public or always visible
    { name: 'Configurações', icon: Settings, path: '/settings', permission: 'admin.settings' },
  ], []);

  // FIX #7: hasPermission vem do hook centralizado usePermissions()

  const handleLinkClick = () => {
    if (window.innerWidth <= 768) {
      closeMobileMenu();
    }
  };

  const sidebarStyle = config.sidebar_bg
    ? { background: config.sidebar_bg }
    : undefined;

  return (
    <>
      <div 
        className={`${styles.backdrop} ${isMobileOpen ? styles.backdropVisible : ''}`} 
        onClick={closeMobileMenu}
      />
      <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''} ${isMobileOpen ? styles.mobileOpen : ''}`} style={sidebarStyle}>
        <div className={styles.logoArea}>
          {!isCollapsed && (
            <div className={styles.logoContainer}>
              {config.logo_url ? (
                <img src={config.logo_url} alt={config.app_name} className={styles.imageLogo} />
              ) : (
                <>
                  <img src="/logo.png" alt="Vórtice Tecnologia" className={`${styles.imageLogo} ${styles.logoLight}`} />
                  <img src="/logo-dark.png" alt="Vórtice Tecnologia" className={`${styles.imageLogo} ${styles.logoDark}`} />
                </>
              )}
            </div>
          )}

          <button 
            onClick={toggleSidebar} 
            className={styles.toggleBtn}
            title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className={styles.nav}>
          {mounted && navItems.filter(item => hasPermission(item.permission)).map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={`${styles.navItem} ${pathname === item.path ? styles.navItemActive : ''}`}
              title={isCollapsed ? item.name : ""}
              onClick={handleLinkClick}
            >
               {isCollapsed ? <item.icon size={20} /> : (
                <>
                  <item.icon size={20} />
                  <span>{item.name}</span>
                  {item.path === '/chat' && unreadChatCount > 0 && (
                    <span className={styles.notificationBadge}>{unreadChatCount}</span>
                  )}
                </>
              )}
              {isCollapsed && item.path === '/chat' && unreadChatCount > 0 && (
                <div className={styles.collapsedBadge} />
              )}
            </Link>
          ))}

          {/* FIX #20: Seção Admin visível apenas para ADMIN */}
          {mounted && isAdmin && (
            <>
              <div className={styles.navSeparator}>{!isCollapsed && <span>Admin</span>}</div>

              <Link
                href="/master"
                className={`${styles.navItem} ${styles.navItemMaster} ${pathname === '/master' ? styles.navItemActive : ''}`}
                title={isCollapsed ? 'Painel Master' : ''}
                onClick={handleLinkClick}
              >
                <ShieldCheck size={20} />
                {!isCollapsed && (
                  <span className={styles.masterLabel}>
                    Painel Master
                    <span className={styles.adminBadge}>ADMIN</span>
                  </span>
                )}
              </Link>
            </>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <button 
            className={styles.profileCard} 
            onClick={(e) => {
              e.preventDefault();
              logout();
            }} 
            title="Clique para sair"
          >
             <div className={styles.avatar}>
               {user?.name?.charAt(0) || 'U'}
               {user?.name?.split(' ')[1]?.charAt(0) || ''}
             </div>
            {!isCollapsed && (
              <div className={styles.profileInfo}>
                <p>{user?.name || 'Carregando...'}</p>
                <span>{user?.role || 'Acessando...'}</span>
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};



export default Sidebar;
