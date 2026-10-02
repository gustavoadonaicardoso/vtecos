"use client";

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from '../social.module.css';
import PlatformIcon from './PlatformIcon';
import { POST_STATUS_META, postCalendarDate } from '../status';
import type { SocialAccount, SocialPost } from '@/types';

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_VISIBLE_PER_DAY = 3;

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - result.getDay());
  return result;
}

interface ContentCalendarProps {
  posts: SocialPost[];
  accounts: SocialAccount[];
  onDayClick: (date: Date) => void;
  onPostClick: (post: SocialPost) => void;
}

export default function ContentCalendar({ posts, accounts, onDayClick, onPostClick }: ContentCalendarProps) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => new Date());

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    for (const post of posts) {
      const date = postCalendarDate(post);
      if (!date) continue;
      const key = dayKey(new Date(date));
      map.set(key, [...(map.get(key) || []), post]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(postCalendarDate(a)!).getTime() - new Date(postCalendarDate(b)!).getTime());
    }
    return map;
  }, [posts]);

  const days = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, index) => ({
        date: new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
        inMonth: true,
      }));
    }
    // Mesma grade de 42 células do módulo de Agendamento.
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      return { date, inMonth: date.getMonth() === month };
    });
  }, [cursor, view]);

  const move = (direction: -1 | 1) => {
    setCursor((current) =>
      view === 'week'
        ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7)
        : new Date(current.getFullYear(), current.getMonth() + direction, 1)
    );
  };

  const title =
    view === 'week'
      ? `Semana de ${days[0].date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
      : cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const todayKey = dayKey(new Date());

  return (
    <div className={styles.panel}>
      <div className={styles.calendarToolbar}>
        <div className={styles.calendarNav}>
          <button type="button" className={styles.iconButton} onClick={() => move(-1)} aria-label="Anterior">
            <ChevronLeft size={16} />
          </button>
          <h2>{title}</h2>
          <button type="button" className={styles.iconButton} onClick={() => move(1)} aria-label="Próximo">
            <ChevronRight size={16} />
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => setCursor(new Date())}>
            Hoje
          </button>
        </div>
        <div className={styles.segmented}>
          <button type="button" className={view === 'month' ? styles.segmentActive : ''} onClick={() => setView('month')}>
            Mês
          </button>
          <button type="button" className={view === 'week' ? styles.segmentActive : ''} onClick={() => setView('week')}>
            Semana
          </button>
        </div>
      </div>

      <div className={styles.calendarGrid}>
        {WEEK_DAYS.map((label) => (
          <div key={label} className={styles.calendarHeaderCell}>{label}</div>
        ))}
        {days.map(({ date, inMonth }) => {
          const key = dayKey(date);
          const dayPosts = postsByDay.get(key) || [];
          const limit = view === 'week' ? dayPosts.length : MAX_VISIBLE_PER_DAY;
          return (
            <div
              key={key}
              className={[
                styles.calendarDay,
                view === 'week' ? styles.weekDay : '',
                inMonth ? '' : styles.otherMonth,
                key === todayKey ? styles.today : '',
              ].join(' ')}
              onClick={() => onDayClick(date)}
            >
              <span className={styles.dayNumber}>{date.getDate()}</span>
              {dayPosts.slice(0, limit).map((post) => {
                const firstAccount = accountsById.get(post.targets[0]?.account_id || '');
                const time = new Date(postCalendarDate(post)!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={post.id}
                    className={styles.calendarPost}
                    style={{ borderLeftColor: POST_STATUS_META[post.status].color }}
                    title={`${POST_STATUS_META[post.status].label} — ${post.caption}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onPostClick(post);
                    }}
                  >
                    {firstAccount && <PlatformIcon platform={firstAccount.platform} size={11} />}
                    <span>{time} · {post.caption || 'Sem legenda'}</span>
                  </div>
                );
              })}
              {dayPosts.length > limit && (
                <span className={styles.moreLabel}>+{dayPosts.length - limit} post(s)</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
