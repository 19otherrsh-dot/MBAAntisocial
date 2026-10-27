'use client';

import { useMemo, useState } from 'react';
import { CalendarPlus, Plus, Sparkles, BookPlus, CalendarDays, Trash2, Pencil } from 'lucide-react';
import { WEEKDAYS, parseClock, weekdayIndex } from '@mba/shared/academics';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useNow } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import CourseDialog from '@/components/academics/CourseDialog';
import AddClassDialog from '@/components/academics/AddClassDialog';
import ImportDialog from '@/components/academics/ImportDialog';
import TodayClasses from '@/components/academics/TodayClasses';
import CalendarFeedButton from '@/components/academics/CalendarFeedButton';
import type { AcademicsData, SlotView } from '@/components/academics/types';
import ac from '@/components/academics/academics.module.css';
import styles from '../app.module.css';

const HOUR_PX = 56;

export default function TimetablePage() {
  const toast = useToast();
  const now = useNow();
  const { data, refetch } = useApiQuery<AcademicsData>('/api/academics');
  const [dialog, setDialog] = useState<null | 'course' | 'class' | 'import'>(null);
  const [selected, setSelected] = useState<SlotView | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const todayIndex = weekdayIndex(new Date(now), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [mobileDay, setMobileDay] = useState(String(Math.min(todayIndex, 5)));

  const courseOf = useMemo(() => new Map((data?.courses ?? []).map((c) => [c._id, c])), [data]);
  const slots = useMemo(() => data?.slots ?? [], [data]);
  const days = slots.some((s) => s.day === 6) ? 7 : 6;
  const [startHour, endHour] = useMemo(() => {
    if (slots.length === 0) return [8, 18];
    const starts = slots.map((s) => parseClock(s.start) ?? 540);
    const ends = slots.map((s) => parseClock(s.end) ?? 1080);
    return [Math.min(8, Math.floor(Math.min(...starts) / 60)), Math.max(18, Math.ceil(Math.max(...ends) / 60))];
  }, [slots]);
  const minutesNow = new Date(now).getHours() * 60 + new Date(now).getMinutes();

  const removeSlot = async (slot: SlotView) => {
    try {
      await api.delete(`/api/academics/slots/${slot._id}`);
      setSelected(null);
      refetch();
    } catch (caught) {
      toast.error('Could not remove', errorMessage(caught));
    }
  };

  const defaultTerm = data?.settings.currentTerm ?? '';

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Timetable</h1>
          <p className={styles.pageSubtitle}>Your week at a glance. Mark attendance as you go — the rest updates itself.</p>
        </div>
        <div className="row gap-2 wrap">
          <Button icon={<Sparkles size={15} />} onClick={() => setDialog('import')}>Import from screenshot</Button>
          <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setDialog('class')}>Add class</Button>
          <Button variant="ghost" icon={<BookPlus size={15} />} onClick={() => setDialog('course')}>Add course</Button>
          <CalendarFeedButton />
        </div>
      </div>

      {!data ? (
        <div className="skeleton" style={{ height: 420 }} />
      ) : data.courses.length === 0 ? (
        <EmptyState
          art={<CalendarDays size={36} strokeWidth={1.4} />}
          title="Set up your week in a minute"
          body="Upload a screenshot or PDF of your timetable and we will read it for you — or add courses by hand."
          action={<Button icon={<Sparkles size={15} />} onClick={() => setDialog('import')}>Import from screenshot</Button>}
        />
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHead}><CalendarPlus size={15} /> Today</div>
            <TodayClasses classes={data.today} onChanged={refetch} />
          </section>

          <div className={ac.weekWrap}>
            <div className={ac.week} style={{ ['--days' as string]: days }}>
              <div className={ac.weekHead} />
              {WEEKDAYS.slice(0, days).map((d, i) => <div key={d} className={cn(ac.weekHead, i === todayIndex && ac.weekHeadToday)}>{d}</div>)}
              <div className={ac.timeCol} style={{ height: (endHour - startHour) * HOUR_PX }}>
                {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
                  <span key={i} className={ac.timeLabel} style={{ top: i * HOUR_PX }}>{i === 0 ? '' : `${String(startHour + i).padStart(2, '0')}:00`}</span>
                ))}
              </div>
              {Array.from({ length: days }, (_, day) => (
                <div key={day} className={ac.dayCol} style={{ height: (endHour - startHour) * HOUR_PX }}>
                  {Array.from({ length: endHour - startHour }, (_, i) => <span key={i} className={ac.hourLine} style={{ top: i * HOUR_PX }} />)}
                  {day === todayIndex && minutesNow > startHour * 60 && minutesNow < endHour * 60 && (
                    <span className={ac.nowLine} style={{ top: ((minutesNow - startHour * 60) / 60) * HOUR_PX }} aria-hidden />
                  )}
                  {slots.filter((s) => s.day === day).map((s) => {
                    const course = courseOf.get(s.course);
                    const top = (((parseClock(s.start) ?? 0) - startHour * 60) / 60) * HOUR_PX;
                    const height = Math.max(22, (((parseClock(s.end) ?? 0) - (parseClock(s.start) ?? 0)) / 60) * HOUR_PX - 2);
                    return (
                      <button key={s._id} className={ac.block} onClick={() => setSelected(s)}
                        style={{ top, height, borderLeftColor: course?.color, background: `color-mix(in srgb, ${course?.color ?? '#888'} 14%, var(--surface))` }}>
                        <strong>{course?.code || course?.name}</strong>
                        {s.start}–{s.end}{s.room ? ` · ${s.room}` : ''}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className={cn(ac.mobileOnly, 'stack gap-3')}>
            <Segmented ariaLabel="Day" value={mobileDay} onChange={setMobileDay} options={WEEKDAYS.slice(0, days).map((d, i) => ({ value: String(i), label: d }))} />
            <div className={ac.dayList}>
              {slots.filter((s) => s.day === Number(mobileDay)).length === 0 && <p className="dim">No classes.</p>}
              {slots.filter((s) => s.day === Number(mobileDay)).map((s) => {
                const course = courseOf.get(s.course);
                return (
                  <button key={s._id} className={ac.classRow} onClick={() => setSelected(s)} style={{ textAlign: 'left' }}>
                    <span className={ac.swatch} style={{ background: course?.color }} />
                    <span className={ac.time}>{s.start}–{s.end}</span>
                    <div className="stack" style={{ minWidth: 0 }}>
                      <strong className="truncate">{course?.name}</strong>
                      <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{[course?.code, s.room, course?.professor].filter(Boolean).join(' · ')}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {selected && (() => {
        const course = courseOf.get(selected.course);
        return (
          <Dialog open onClose={() => setSelected(null)} title={course?.name ?? 'Class'} description={`${WEEKDAYS[selected.day]} ${selected.start}–${selected.end}${selected.room ? ` · ${selected.room}` : ''}`}
            footer={<>
              <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => removeSlot(selected)}>Remove this class</Button>
              <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => { setSelected(null); setDialog('course'); setEditing(selected.course); }}>Edit course</Button>
            </>}>
            <p className="muted">{[course?.code, course?.professor, `${course?.credits} credits`].filter(Boolean).join(' · ')}</p>
            {course && <p className="muted">Attendance {course.attendance.percent}% · bar {course.requiredAttendance}%</p>}
          </Dialog>
        );
      })()}

      {dialog === 'course' && (
        <CourseDialog course={editing ? courseOf.get(editing) : null} defaultTerm={defaultTerm} onClose={() => { setDialog(null); setEditing(null); }} onSaved={() => { setDialog(null); setEditing(null); refetch(); }} />
      )}
      {dialog === 'class' && data && (
        <AddClassDialog courses={data.courses} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refetch(); }} onNewCourse={() => setDialog('course')} />
      )}
      {dialog === 'import' && <ImportDialog defaultTerm={defaultTerm} onClose={() => setDialog(null)} onImported={() => { setDialog(null); refetch(); }} />}
    </div>
  );
}
