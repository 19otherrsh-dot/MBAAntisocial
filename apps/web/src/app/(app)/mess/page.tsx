'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Utensils } from 'lucide-react';
import { WEEKDAYS } from '@mba/shared/academics';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

type Meal = 'breakfast' | 'lunch' | 'snacks' | 'dinner';
interface MessData {
  messes: string[]; mess: string; weekStart: string; today: string; menu: Array<Record<Meal, string[]>> | null;
  ratings: Array<{ day: string; meal: Meal; avg: number; count: number }>; mine: Array<{ day: string; meal: Meal; rating: number }>; canEdit: boolean; meals: Meal[];
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function MessPage() {
  const toast = useToast();
  const [mess, setMess] = useState<string | undefined>(undefined);
  const [week, setWeek] = useState<string | undefined>(undefined);
  const { data, refetch } = useApiQuery<MessData>('/api/mess', { mess, week });
  const [dayIndex, setDayIndex] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const todayIndex = data ? Math.max(0, Math.min(6, Math.round((new Date(`${data.today}T12:00:00Z`).getTime() - new Date(`${data.weekStart}T12:00:00Z`).getTime()) / 86_400_000))) : 0;
  const selected = Number(dayIndex ?? todayIndex);
  const selectedDay = data ? addDays(data.weekStart, selected) : '';
  const ratingOf = useMemo(() => new Map((data?.ratings ?? []).map((r) => [`${r.day}:${r.meal}`, r])), [data]);
  const mineOf = useMemo(() => new Map((data?.mine ?? []).map((r) => [`${r.day}:${r.meal}`, r.rating])), [data]);

  const rate = async (meal: Meal, rating: number) => {
    try {
      await api.post('/api/mess', { mess: data!.mess, day: selectedDay, meal, rating });
      refetch();
    } catch (caught) {
      toast.error('Could not rate', errorMessage(caught));
    }
  };

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Mess menu</h1>
          <p className={styles.pageSubtitle}>What’s cooking this week — and what everyone thought of it.</p>
        </div>
        <div className="row gap-2 wrap">
          {data && data.messes.length > 1 && <Select aria-label="Mess" value={data.mess} onChange={(e) => setMess(e.target.value)} options={data.messes.map((m) => ({ value: m, label: m }))} />}
          {data?.canEdit && <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>Edit menu</Button>}
        </div>
      </div>
      {!data ? <div className="skeleton" style={{ height: 300 }} /> : (
        <>
          <div className="row gap-2 wrap">
            <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />} aria-label="Previous week" onClick={() => setWeek(addDays(data.weekStart, -7))} />
            <Segmented ariaLabel="Day" value={String(selected)} onChange={setDayIndex} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: i === todayIndex && data.weekStart <= data.today && addDays(data.weekStart, 6) >= data.today ? `${d} · today` : d }))} />
            <Button size="sm" variant="ghost" icon={<ChevronRight size={14} />} aria-label="Next week" onClick={() => setWeek(addDays(data.weekStart, 7))} />
          </div>
          {!data.menu ? (
            <EmptyState art={<Utensils size={36} strokeWidth={1.4} />} title="No menu for this week yet" body={data.canEdit ? 'Add it — everyone on campus will thank you.' : 'The mess committee has not posted it yet.'} action={data.canEdit ? <Button onClick={() => setEditing(true)}>Add this week’s menu</Button> : undefined} />
          ) : (
            <div className={cs.menuGrid}>
              {data.meals.map((meal) => {
                const items = data.menu![selected]?.[meal] ?? [];
                const r = ratingOf.get(`${selectedDay}:${meal}`);
                const mine = mineOf.get(`${selectedDay}:${meal}`) ?? 0;
                const canRate = selectedDay <= data.today && items.length > 0;
                return (
                  <div key={meal} className={cs.meal}>
                    <div className={cs.mealHead}>{meal}{r && <span className="dim" style={{ fontSize: 'var(--t-xs)', fontWeight: 500, textTransform: 'none' }}>★ {r.avg} ({r.count})</span>}</div>
                    {items.length === 0 ? <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>—</span> : <span style={{ fontSize: 'var(--t-sm)' }}>{items.join(' · ')}</span>}
                    {canRate && (
                      <div className={cs.stars} role="radiogroup" aria-label={`Rate ${meal}`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} role="radio" aria-checked={mine === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={cn(cs.star, n <= mine && cs.starOn)} onClick={() => rate(meal, n)}>★</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {editing && data && <EditMenuDialog data={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refetch(); }} />}
    </div>
  );
}

function EditMenuDialog({ data, onClose, onSaved }: { data: MessData; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [mess, setMess] = useState(data.mess);
  const [days, setDays] = useState<Array<Record<Meal, string>>>(() =>
    Array.from({ length: 7 }, (_, i) => Object.fromEntries(data.meals.map((m) => [m, (data.menu?.[i]?.[m] ?? []).join(', ')])) as Record<Meal, string>)
  );
  const [day, setDay] = useState('0');
  const save = async () => {
    try {
      await api.put('/api/mess', {
        mess,
        weekStart: data.weekStart,
        days: days.map((d) => Object.fromEntries(data.meals.map((m) => [m, d[m].split(',').map((x) => x.trim()).filter(Boolean)]))),
      });
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Menu for the week of ${data.weekStart}`} description="Separate dishes with commas."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Publish</Button></>}>
      <Input label="Mess" value={mess} onChange={(e) => setMess(e.target.value)} />
      <Segmented ariaLabel="Day" value={day} onChange={setDay} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
      {data.meals.map((m) => (
        <Textarea key={m} label={m[0].toUpperCase() + m.slice(1)} rows={2} value={days[Number(day)][m]} onChange={(e) => setDays(days.map((d, i) => (i === Number(day) ? { ...d, [m]: e.target.value } : d)))} />
      ))}
    </Dialog>
  );
}
