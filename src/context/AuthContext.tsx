"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Paramos de importar services e sb diretamente, para não levar libs pesadas e segredos ao client
// Tipos centralizados em @/types
import type { UserProfile, UserPermissions } from '@/types';

// Re-exporta para compatibilidade com imports existentes
export type { UserProfile, UserPermissions };

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (userData: UserProfile) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const logoutRef = useRef<() => void>(() => {});

  const logout = useCallback(async () => {
    if (user) {
      try {
        await fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: { id: user.id, name: user.name },
            action: 'LOGOUT',
            details: `Usuário ${user.name} saiu do sistema.`
          })
        });
      } catch (e) {}
    }
    localStorage.removeItem('vortice_user');
    
    // Encerrar sessão via backend
    try {
       await fetch('/api/auth/logout', { method: 'POST' });
    } catch(e) {}

    setUser(null);
    setIsAuthenticated(false);
    router.push('/login');
  }, [user, router]);

  // Mantém a ref sempre atualizada com a versão mais recente de logout
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  const refreshUser = async () => {
    if (!user?.id) return;
    try {
      const resp = await fetch(`/api/auth/refresh?id=${user.id}`);
      if (resp.ok) {
        const { data } = await resp.json();
        localStorage.setItem('vortice_user', JSON.stringify(data));
        setUser(data);
      }
    } catch (e) {
      console.error('Error refreshing user:', e);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem('vortice_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);

        // Background sync: atualiza permissões e verifica status
        fetch(`/api/auth/refresh?id=${parsedUser.id}`)
          .then(r => r.json())
          .then(({ data, error }) => {
            if (data && !error) {
              localStorage.setItem('vortice_user', JSON.stringify(data));
              setUser(data);
              if (data.status === 'INACTIVE') logoutRef.current();
            }
          })
          .catch(() => {});

      } catch (e) {
        localStorage.removeItem('vortice_user');
      }
    }
    setIsLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const publicRoutes = ['/login', '/display', '/totem'];
    if (!isLoading && !isAuthenticated && !publicRoutes.includes(pathname)) {
      router.push('/login');
    }
    if (!isLoading && isAuthenticated && pathname === '/login') {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  const login = (userData: UserProfile) => {
    localStorage.setItem('vortice_user', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

