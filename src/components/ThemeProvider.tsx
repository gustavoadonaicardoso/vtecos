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

/**
 * A cor principal do Painel Master vira o --accent do sistema (botões,
 * links, abas). Com a cor padrão, os temas claro/escuro mantêm os tons
 * próprios definidos em globals.css.
 */
function applyBrandColors(primary?: string | null, secondary?: string | null) {
  const root = document.documentElement.style;
  const custom = /^#[0-9a-f]{6}$/i.test(primary || '') && primary!.toLowerCase() !== DEFAULT_CONFIG.primary_color;

  if (custom) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(primary!.slice(i, i + 2), 16));
    root.setProperty('--accent', primary!);
    root.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.25)`);
    root.setProperty('--glass-border-focus', `rgba(${r}, ${g}, ${b}, 0.4)`);
    root.setProperty('--brand-primary', primary!);
    root.setProperty('--primary', primary!);
  } else {
    ['--accent', '--accent-glow', '--glass-border-focus', '--brand-primary', '--primary'].forEach((name) => root.removeProperty(name));
  }

  if (secondary) {
    root.setProperty('--secondary', secondary);
    root.setProperty('--brand-accent', secondary);
  }
}

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
      applyBrandColors(data.primary_color, data.secondary_color);
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
