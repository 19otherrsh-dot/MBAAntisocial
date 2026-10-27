'use client';

import { CalendarCheck } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import type { TodayClass } from './types';
import styles from './academics.module.css';

const OPTIONS = [
  { value: 'present', label: 'Went', on: styles.markOn },
  { value: 'absent', label: 'Missed', on: styles.markOff },
  { value: 'cancelled', label: 'Cancelled', on: styles.markCancel },
] as const;

/** Today's classes with one-tap attendance. Tapping the active mark clears it. */
export default function TodayClasses({ classes, onChanged, compact }: { classes: TodayClass[]; onChanged: () => void; compact?: boolean }) {
  const toast = useToast();
  if (classes.length === 0) {
    return <p className="dim row gap-2" style={{ fontSize: 'var(--t-sm)' }}><CalendarCheck size={15} /> No classes today.</p>;
  }
  const mark = async (c: TodayClass, status: TodayClass['status']) => {
    try {
      await api.post('/api/academics/attendance', { course: c.courseId, day: c.day, slot: c.slotId, status: c.status === status ? null : status });
      onChanged();
    } catch (caught) {
      toast.error('Could not mark that', errorMessage(caught));
    }
  };
  return (
    <div className={styles.dayList}>
      {classes.map((c) => (
        <div key={c.slotId} className={styles.classRow}>
          <span className={styles.swatch} style={{ background: c.color }} />
          <span className={styles.time}>{c.start}–{c.end}</span>
          <div className="stack" style={{ minWidth: 0 }}>
            <strong className="truncate">{c.code ? `${c.code} · ` : ''}{c.name}</strong>
            {!compact && c.room && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{c.room}</span>}
          </div>
          <div className={styles.markButtons} role="group" aria-label={`Attendance for ${c.name}`}>
            {OPTIONS.map((o) => (
              <button key={o.value} className={cn(styles.mark, c.status === o.value && o.on)} aria-pressed={c.status === o.value} onClick={() => mark(c, o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
