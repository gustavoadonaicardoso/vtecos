'use client';

import { useEffect, useState } from 'react';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
}

let cache: Promise<TeamMember[]> | null = null;

/** Membros ativos da empresa (para escolher o responsável do lead). */
export function useTeam(enabled = true) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  useEffect(() => {
    if (!enabled) return;
    cache ??= fetch('/api/users?scope=chat', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((json) => (Array.isArray(json.data) ? json.data : []))
      .catch(() => {
        cache = null;
        return [];
      });
    let alive = true;
    cache.then((list) => alive && setTeam(list));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return team;
}
