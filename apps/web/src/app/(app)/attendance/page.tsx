'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ClipboardCheck, History, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { cn, formatDate } from '@/lib/utils';
import TodayClasses from '@/components/academics/TodayClasses';
import type { AcademicsData, CourseView } from '@/components/academics/types';
import ac from '@/components/academics/academics.module.css';
import styles from '../app.module.css';

function verdict(c: CourseView): { text: string; tone: string } {
  const a = c.attendance;
  if (!a.recoverable) return { text: `Can’t reach ${c.requiredAttendance}% this term any more`, tone: ac.bad };
  if (a.mustAttend > 0) return { text: `Attend the next ${a.mustAttend} to get back to ${c.requiredAttendance}%`, tone: ac.bad };
  if (a.canSkip === 0) return { text: 'Right at the bar — don’t miss the next one', tone: ac.warn };
  return { text: `You can miss ${a.canSkip >= 999 ? 'plenty' : a.canSkip} more`, tone: ac.good };
}

export default function AttendancePage() {
  const toast = useToast();
  const { data, refetch } = useApiQuery<AcademicsData>('/api/academics');
  const [history, setHistory] = useState<CourseView | null>(null);

  const markToday = async (course: CourseView, status: 'present' | 'absent') => {
    try {
      // No slot: an extra class not on the timetable.
      const day = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      await api.post('/api/academics/attendance', { course: course._id, day, status });
      refetch();
    } catch (caught) {
      toast.error('Could not mark it', errorMessage(caught));
    }
  };

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Attendance</h1>
          <p className={styles.pageSubtitle}>Per-course percentages, and exactly how many you can miss — or need to attend.</p>
        </div>
        <Link href="/timetable"><Button variant="ghost" icon={<CalendarCheck size={15} />}>Timetable</Button></Link>
      </div>

      {!data ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : data.courses.length === 0 ? (
        <EmptyState art={<ClipboardCheck size={36} strokeWidth={1.4} />} title="Add your courses first" body="Set up your timetable and attendance tracks itself as you mark each class." action={<Link href="/timetable"><Button>Set up timetable</Button></Link>} />
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHead}>Today</div>
            <TodayClasses classes={data.today} onChanged={refetch} compact />
          </section>
          <div className={ac.courses} data-reveal="">
            {data.courses.map((c) => {
              const v = verdict(c);
              const pct = c.attendance.percent;
              const ringColor = pct >= c.requiredAttendance ? 'var(--success)' : pct >= c.requiredAttendance - 5 ? 'var(--amber)' : 'var(--danger)';
              return (
                <div key={c._id} className={ac.courseCard} style={{ borderTopColor: c.color }}>
                  <div className="row gap-3">
                    <div className={ac.ring} style={{ background: `conic-gradient(${ringColor} ${pct * 3.6}deg, var(--bg-sunken) 0)` }} aria-label={`${pct}% attendance`}>
                      <div className={ac.ringInner}>{Math.round(pct)}%</div>
                    </div>
                    <div className="stack gap-1" style={{ minWidth: 0 }}>
                      <strong className="truncate">{c.name}</strong>
                      <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{c.attendance.present} attended · {c.attendance.absent} missed{c.attendance.cancelled ? ` · ${c.attendance.cancelled} cancelled` : ''}</span>
                      <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Bar {c.requiredAttendance}%{c.plannedSessions ? ` · ${c.plannedSessions} sessions` : ''}</span>
                    </div>
                  </div>
                  <span className={cn(ac.verdict, v.tone)}>{v.text}</span>
                  {c.attendance.bestCase !== undefined && (
                    <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Finishing range: {c.attendance.worstCase}% – {c.attendance.bestCase}%</span>
                  )}
                  <div className="row gap-2 wrap">
                    <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => markToday(c, 'present')}>Went today</Button>
                    <Button size="sm" variant="ghost" onClick={() => markToday(c, 'absent')}>Missed</Button>
                    <span style={{ flex: 1 }} />
                    <Button size="sm" variant="ghost" icon={<History size={13} />} onClick={() => setHistory(c)} aria-label={`History for ${c.name}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {history && <HistoryDialog course={history} onClose={() => setHistory(null)} onChanged={refetch} />}
    </div>
  );
}

function HistoryDialog({ course, onClose, onChanged }: { course: CourseView; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, refetch } = useApiQuery<{ marks: Array<{ _id: string; day: string; status: 'present' | 'absent' | 'cancelled'; slot: string | null }> }>('/api/academics/attendance', { course: course._id });
  const clear = async (m: { day: string; slot: string | null }) => {
    try {
      await api.post('/api/academics/attendance', { course: course._id, day: m.day, ...(m.slot ? { slot: m.slot } : {}), status: null });
      refetch();
      onChanged();
    } catch (caught) {
      toast.error('Could not remove', errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title={course.name} description="Every class you have marked. Remove a mark to correct it.">
      {!data ? <div className="skeleton" style={{ height: 120 }} /> : data.marks.length === 0 ? <p className="dim">Nothing marked yet.</p> : (
        <div className="stack gap-1" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {data.marks.map((m) => (
            <div key={m._id} className="row gap-2" style={{ padding: '6px 4px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ width: 120 }}>{formatDate(m.day)}</span>
              <span className={m.status === 'present' ? ac.good : m.status === 'absent' ? ac.bad : 'dim'} style={{ fontWeight: 600, flex: 1 }}>{m.status === 'present' ? 'Went' : m.status === 'absent' ? 'Missed' : 'Cancelled'}</span>
              <Button size="sm" variant="ghost" onClick={() => clear(m)}>Remove</Button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
