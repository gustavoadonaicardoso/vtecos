"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
// Tipos centralizados em @/types
import type { BrandingConfig, Theme } from '@/types';

export type { BrandingConfig, Theme };

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  config: BrandingConfig;
  refreshConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: BrandingConfig = {
  primary_color: '#3b82f6',
  secondary_color: '#8b5cf6',
  logo_url: '',
  favicon_url: '',
  app_name: 'Vórtice CRM',
  sidebar_bg: ''
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<BrandingConfig>(DEFAULT_CONFIG);

  const fetchConfig = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('system_config').select('*').eq('id', 'branding').single();
    if (data) {
      setConfig(data);
      // Apply CSS variables
      document.documentElement.style.setProperty('--primary', data.primary_color);
      document.documentElement.style.setProperty('--secondary', data.secondary_color);
      if (data.sidebar_bg) {
        document.documentElement.style.setProperty('--sidebar-bg', data.sidebar_bg);
      } else {
        document.documentElement.style.removeProperty('--sidebar-bg');
      }
      
      // Update Favicon
      if (data.favicon_url) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = data.favicon_url;
      }
      
      // Update Title
      if (data.app_name) {
        document.title = data.app_name;
      }
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) setTheme(savedTheme);
    setMounted(true);
    fetchConfig();
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, config, refreshConfig: fetchConfig }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
