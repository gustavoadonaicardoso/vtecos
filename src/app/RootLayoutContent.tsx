"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useAuth, AuthProvider } from '@/context/AuthContext';
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import styles from "./layout.module.css";
import NewLeadModal from "@/components/NewLeadModal";
import { LeadProvider, useLeads } from "@/context/LeadContext";
import { PresenceProvider } from "@/context/PresenceContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider } from "@/components/SidebarProvider";
import { TwilioProvider, useTwilio } from "@/context/TwilioContext";
import Dialer from "@/components/Dialer";
import BrowserNotificationListener from "@/components/BrowserNotificationListener";
import WhatsAppNotificationListener from "@/components/WhatsAppNotificationListener";
import InAppToasts from "@/components/InAppToasts";
import SupportAccessBar from "@/components/SupportAccessBar";
import { isPublicRoute } from "@/lib/public-routes";
// FIX #7: hook centralizado de permissões — sem duplicação
import { usePermissions } from "@/lib/permissions";
import { routePermission } from "@/lib/permissions.constants";
import { isRouteAllowed } from "@/lib/plans";

function AppGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { isModalOpen } = useLeads();
  const { isDialerOpen, closeDialer } = useTwilio();
  // FIX #7: usa hook centralizado
  const { hasPermission } = usePermissions();

  const isPublicPage = isPublicRoute(pathname);

  const fullPageRoutes = ['/chat', '/messages'];
  // O editor de planejamentos é uma rota dinâmica (/planejamentos/[id]) --
  // precisa de prefixo em vez de igualdade exata como as demais.
  const isFullPage = fullPageRoutes.includes(pathname) || pathname.startsWith('/planejamentos/');

  // Cada empresa só abre as páginas dos módulos do seu plano
  // (a empresa da plataforma tem todos).
  const modules = user?.workspace?.modules;

  // Verifica acesso à rota atual
  const checkRouteAccess = () => {
    if (isPublicPage || !user) return true;
    if (pathname === '/master' || pathname.startsWith('/admin')) {
      return user.role === 'ADMIN' && Boolean(user.workspace?.is_platform);
    }
    if (modules && !isRouteAllowed(pathname, modules)) return false;
    if (pathname === '/') return true;

    const requiredPermission = routePermission(pathname);
    if (!requiredPermission) return true;

    // FIX #7: rota admin.root bloqueada explicitamente para não-ADMIN
    if (requiredPermission === 'admin.root') return user.role === 'ADMIN';

    return hasPermission(requiredPermission);
  };

  const canAccess = checkRouteAccess();

  // Sem isso, uma página protegida renderizava o conteúdo (com dados de
  // ninguém, já que não há usuário) antes do efeito de redirecionamento
  // rodar -- dava pra ver um "flash" do layout/dashboard por trás da
  // tela de login. Enquanto carrega a sessão ou ela não existe, não
  // renderiza nada do conteúdo protegido; o redirect cuida do resto.
  if (!isPublicPage && (isLoading || !isAuthenticated)) {
    return (
      <div style={{ height: '100vh', background: 'var(--background)' }} />
    );
  }

  if (!isLoading && !isPublicPage && user && !canAccess) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--background)',
        color: 'var(--foreground)',
        textAlign: 'center',
        padding: '20px'
      }}>
        <h1 style={{ color: '#ef4444', marginBottom: '16px' }}>Acesso Negado</h1>
        <p style={{ opacity: 0.7, maxWidth: '400px', marginBottom: '24px' }}>
          Você não tem permissão para acessar este módulo. Entre em contato com seu administrador.
        </p>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '10px 24px',
            background: 'var(--brand-primary, #3b82f6)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  return (
    <>
      {isPublicPage ? (
        <main>{children}</main>
      ) : (
        <div className={styles.layoutContainer}>
          <Sidebar />
          <div className={`${styles.mainContent} ${isFullPage ? styles.mainContentFullPage : ''}`}>
            <SupportAccessBar />
            {!isFullPage && <Navbar />}
            <main className={isFullPage ? styles.fullPageContent : styles.pageScrollContainer}>
              {children}
            </main>
          </div>
          {/* FIX #6: modal só montado quando está aberto */}
          {isModalOpen && <NewLeadModal />}
          {isDialerOpen && <Dialer onClose={closeDialer} />}
        </div>
      )}
    </>
  );
}

export default function RootLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SidebarProvider>
          <TwilioProvider>
            <LeadProvider>
              <PresenceProvider>
                <BrowserNotificationListener />
                <WhatsAppNotificationListener />
                <InAppToasts />
                <AppGuard>
                  {children}
                </AppGuard>
              </PresenceProvider>
            </LeadProvider>
          </TwilioProvider>
        </SidebarProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
