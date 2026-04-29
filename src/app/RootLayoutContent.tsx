"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useAuth, AuthProvider } from '@/context/AuthContext';
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import styles from "./layout.module.css";
import HelpFAB from "@/components/HelpFAB";
import NewLeadModal from "@/components/NewLeadModal";
import { LeadProvider, useLeads } from "@/context/LeadContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SidebarProvider } from "@/components/SidebarProvider";
// FIX #7: hook centralizado de permissões — sem duplicação
import { usePermissions, ROUTE_PERMISSIONS } from "@/lib/permissions";

function AppGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { isModalOpen } = useLeads();
  // FIX #7: usa hook centralizado
  const { hasPermission } = usePermissions();

  const isLoginPage = pathname === '/login';
  const isDisplayPage = pathname === '/display';
  const isTotemPage = pathname === '/totem';
  const isPublicPage = isLoginPage || isDisplayPage || isTotemPage;

  const fullPageRoutes = ['/chat', '/messages'];
  const isFullPage = fullPageRoutes.includes(pathname);

  // Verifica acesso à rota atual
  const checkRouteAccess = () => {
    if (isPublicPage || !user) return true;
    if (pathname === '/') return true;

    const requiredPermission = ROUTE_PERMISSIONS[pathname];
    if (!requiredPermission) return true;

    // FIX #7: rota admin.root bloqueada explicitamente para não-ADMIN
    if (requiredPermission === 'admin.root') return user.role === 'ADMIN';

    return hasPermission(requiredPermission);
  };

  const canAccess = checkRouteAccess();

  if (!isLoading && !isPublicPage && user && !canAccess) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        color: '#fff',
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
          <div className={styles.mainContent}>
            {!isFullPage && <Navbar />}
            <main className={isFullPage ? styles.fullPageContent : styles.pageScrollContainer}>
              {children}
            </main>
          </div>
          <HelpFAB />
          {/* FIX #6: modal só montado quando está aberto */}
          {isModalOpen && <NewLeadModal />}
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
          <LeadProvider>
            <AppGuard>
              {children}
            </AppGuard>
          </LeadProvider>
        </SidebarProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
