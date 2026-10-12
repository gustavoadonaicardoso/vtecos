'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CustomFieldDef } from '@/lib/lead-fields';

let cache: { at: number; fields: CustomFieldDef[] } | null = null;
const listeners = new Set<(fields: CustomFieldDef[]) => void>();

/** Campos personalizados da empresa (cache de 1 min, compartilhado entre telas). */
export function useCustomFields() {
  const [fields, setFields] = useState<CustomFieldDef[]>(cache?.fields || []);
  // A lista já veio do servidor (antes disso, não abrir o editor: ele começaria vazio).
  const [loaded, setLoaded] = useState(Boolean(cache));

  const reload = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.at < 60_000) {
      setFields(cache.fields);
      setLoaded(true);
      return cache.fields;
    }
    try {
      const response = await fetch('/api/leads/fields', { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      const list: CustomFieldDef[] = response.ok && Array.isArray(json.data) ? json.data : [];
      if (!response.ok) return cache?.fields || [];
      cache = { at: Date.now(), fields: list };
      listeners.forEach((listener) => listener(list));
      setLoaded(true);
      return list;
    } catch {
      return cache?.fields || [];
    }
  }, []);

  useEffect(() => {
    listeners.add(setFields);
    const timer = window.setTimeout(() => void reload(), 0);
    return () => {
      listeners.delete(setFields);
      window.clearTimeout(timer);
    };
  }, [reload]);

  return { fields, loaded, reload };
}
