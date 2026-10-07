"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeriodKey, ReportData } from '@/lib/reports';

/** Busca /api/reports e mantém o último resultado na tela enquanto recarrega. */
export function useReport(period: PeriodKey, from = '', to = '', enabled = true) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || (period === 'custom' && (!from || !to))) return;
    const id = ++request.current;
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('from', from);
      params.set('to', to);
    }
    try {
      const response = await fetch(`/api/reports?${params}`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (id !== request.current) return;
      if (!response.ok) setError(json.error || 'Não foi possível carregar os números.');
      else {
        setData(json.data);
        setError(null);
      }
    } catch {
      if (id === request.current) setError('Sem conexão com o servidor.');
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [enabled, period, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}
