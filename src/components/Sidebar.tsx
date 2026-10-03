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
  Target,
  Calendar,
  Ticket,
  MessageCircle,
  FileText,
  Megaphone,
  Phone,
  Bell,
  Workflow,
  Share2,
  Calculator
} from 'lucide-react';
import styles from './Sidebar.module.css';
import { useSidebar } from '@/components/SidebarProvider';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { usePermissions } from '@/lib/permissions';
// Hook centralizado de não lidos — não duplicamos lógica de Realtime aqui
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { isRouteAllowed } from '@/lib/plans';


const Sidebar = () => {
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar, isMobileOpen, closeMobileMenu } = useSidebar();
  const { user, logout } = useAuth();
  const { config } = useTheme();
  const { hasPermission, isPlatformAdmin } = usePermissions();
  const [mounted, setMounted] = React.useState(false);
  // Hook centralizado — toda lógica de Realtime fica em useUnreadCount
  const unreadChatCount = useUnreadCount();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = React.useMemo(() => [
    { name: 'Início', icon: LayoutDashboard, path: '/', permission: 'dashboard.view' },
    { name: 'Projetos', icon: Briefcase, path: '/projetos', permission: 'admin.projects' },
    { name: 'Planejamentos', icon: Workflow, path: '/planejamentos', permission: 'planejamentos.view' },
    { name: 'Redes Sociais', icon: Share2, path: '/social', permission: 'social.view' },
    { name: 'Custos e Precificação', icon: Calculator, path: '/financeiro', permission: 'financeiro.view' },
    { name: 'Metas', icon: Target, path: '/metas', permission: 'dashboard.view' },
    { name: 'Mensagens', icon: MessageSquare, path: '/messages', permission: 'messages.view' },
    { name: 'Chat Interno', icon: MessageCircle, path: '/chat', permission: 'messages.send' },
    { name: 'Pipeline', icon: Kanban, path: '/pipeline', permission: 'pipeline.view' },
    { name: 'Leads', icon: Users, path: '/leads', permission: 'leads.view' },
    { name: 'Relatórios', icon: BarChart3, path: '/relatorios', permission: 'dashboard.kpis' },
    { name: 'Agendamento', icon: Calendar, path: '/scheduling', permission: 'integrations.view' },
    { name: 'Senhas', icon: Ticket, path: '/queue', permission: 'integrations.view' },
    { name: 'Notas Fiscais', icon: FileText, path: '/fiscal', permission: 'integrations.view' },
    { name: 'Disparos', icon: Megaphone, path: '/disparos', permission: 'messages.send' },
    { name: 'Discador', icon: Phone, path: '/discador', permission: 'leads.view' },
    
    { name: 'Equipe', icon: UserCog, path: '/users', permission: 'team.view' },
    { name: 'Automações', icon: Zap, path: '/automations', permission: 'automations.view' },
    { name: 'Integrações', icon: Blocks, path: '/integrations', permission: 'integrations.view' },
    { name: 'Notificações', icon: Bell, path: '/notificacoes' }, // Sempre visível — histórico é por usuário
    { name: 'Central de Ajuda', icon: LifeBuoy, path: '/help' }, // Public or always visible
    { name: 'Configurações', icon: Settings, path: '/settings', permission: 'admin.settings' },
  ], []);

  // FIX #7: hasPermission vem do hook centralizado usePermissions()
  // Cada empresa vê só os módulos do seu plano (e, dentro deles, o que o cargo permite).
  const modules = user?.workspace?.modules;
  const visibleItems = React.useMemo(
    () => navItems.filter((item) => (!modules || isRouteAllowed(item.path, modules)) && hasPermission(item.permission)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navItems, modules, user]
  );

  const handleLinkClick = () => {
    if (window.innerWidth <= 768) {
      closeMobileMenu();
    }
  };

  const sidebarStyle = config.sidebar_bg
    ? { background: config.sidebar_bg }
    : undefined;
  const tone = sidebarTone(config.sidebar_bg);
  const toneClass = tone === 'dark' ? styles.toneDark : tone === 'light' ? styles.toneLight : '';

  return (
    <>
      <div 
        className={`${styles.backdrop} ${isMobileOpen ? styles.backdropVisible : ''}`} 
        onClick={closeMobileMenu}
      />
      <aside className={`${styles.sidebar} ${toneClass} ${isCollapsed ? styles.collapsed : ''} ${isMobileOpen ? styles.mobileOpen : ''}`} style={sidebarStyle}>
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
          {mounted && visibleItems.map((item) => (
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
          {mounted && isPlatformAdmin && (
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
               {user?.avatar_url ? (
                 // eslint-disable-next-line @next/next/no-img-element
                 <img src={user.avatar_url} alt="" className={styles.avatarImage} />
               ) : (
                 <>
                   {user?.name?.charAt(0) || 'U'}
                   {user?.name?.split(' ')[1]?.charAt(0) || ''}
                 </>
               )}
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



/**
 * Fundo do menu escolhido no Painel Master: claro ou escuro? O texto do
 * menu segue o fundo (e não o tema), senão some em "Azul Escuro" no tema claro.
 */
function sidebarTone(background?: string | null): 'dark' | 'light' | null {
  const colors = background?.match(/#[0-9a-f]{6}\b/gi);
  if (!colors) return null;
  const brightness = colors.reduce((sum, hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return sum + 0.299 * r + 0.587 * g + 0.114 * b;
  }, 0) / colors.length;
  return brightness < 140 ? 'dark' : 'light';
}

export default Sidebar;
