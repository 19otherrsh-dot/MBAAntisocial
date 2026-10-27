'use client';

import { useState } from 'react';
import { HeartHandshake, Lock, Phone, ShieldAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Banner, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useNow } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { cn, formatDate } from '@/lib/utils';
import ps from '@/components/personal/personal.module.css';
import styles from '../app.module.css';

interface CheckInView { day: string; mood: number; energy: number; sleepHours: number | null; stressors: string[]; note?: string }
interface WellbeingData {
  today: (CheckInView & { note: string }) | null;
  todayKey: string;
  history: CheckInView[];
  insights: { moodWeek: number | null; moodPriorWeek: number | null; energyWeek: number | null; sleepWeek: number | null; topStressors: string[] };
  suggestion: 'reach_out' | null;
  support: {
    campus: { counsellorName: string; counsellorContact: string; hours: string; bookingUrl: string; emergencyContact: string } | null;
    helplines: Array<{ name: string; detail: string; phone: string; alt?: string }>;
    emergency: { name: string; phone: string };
  };
  stressors: string[];
}

const MOODS = [
  { value: 1, emoji: '😣', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];
const ENERGY = ['Drained', 'Tired', 'Steady', 'Energised', 'Buzzing'];

export default function WellbeingPage() {
  const { data, refetch } = useApiQuery<WellbeingData>('/api/wellbeing');
  const [editing, setEditing] = useState(false);

  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  const showForm = !data.today || editing;

  return (
    <div className="stack gap-5" style={{ maxWidth: 860 }}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Wellbeing</h1>
          <p className={styles.pageSubtitle}><Lock size={13} style={{ verticalAlign: '-2px' }} /> Only you can see this. No one — not your campus, not us — gets your check-ins.</p>
        </div>
        <a href="#support"><Button variant="secondary" icon={<HeartHandshake size={15} />}>Talk to someone</Button></a>
      </div>

      {data.suggestion === 'reach_out' && (
        <Banner variant="info" icon={<HeartHandshake size={18} />} title="This week sounds heavy">
          You do not have to carry it alone. Talking to a counsellor — on campus or on a free helpline below — is a normal, confidential thing to do.
        </Banner>
      )}

      {showForm ? (
        <CheckInForm data={data} onSaved={() => { setEditing(false); refetch(); }} />
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHead}>Today</div>
          <div className="row gap-3 wrap">
            <span style={{ fontSize: 34 }}>{MOODS[data.today!.mood - 1].emoji}</span>
            <div className="stack">
              <strong>Feeling {MOODS[data.today!.mood - 1].label.toLowerCase()} · {ENERGY[data.today!.energy - 1].toLowerCase()}</strong>
              <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>
                {data.today!.sleepHours != null ? `${data.today!.sleepHours}h sleep` : 'Sleep not logged'}{data.today!.stressors.length ? ` · ${data.today!.stressors.join(', ')}` : ''}
              </span>
            </div>
            <span style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          </div>
        </section>
      )}

      {data.history.length >= 3 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>Your last few weeks</div>
          <div className="row gap-5 wrap">
            {data.insights.moodWeek !== null && <Stat value={`${data.insights.moodWeek}/5`} label="Mood this week" meta={data.insights.moodPriorWeek !== null ? `${data.insights.moodPriorWeek}/5 the week before` : undefined} />}
            {data.insights.energyWeek !== null && <Stat value={`${data.insights.energyWeek}/5`} label="Energy" />}
            {data.insights.sleepWeek !== null && <Stat value={`${data.insights.sleepWeek}h`} label="Average sleep" />}
          </div>
          <MoodStrip history={data.history} />
          {data.insights.topStressors.length > 0 && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>On your mind lately: {data.insights.topStressors.join(', ')}.</p>}
          {data.insights.sleepWeek !== null && data.insights.sleepWeek < 6 && (
            <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>You have averaged under six hours of sleep. Even one earlier night tends to lift mood and focus more than another hour of prep.</p>
          )}
        </section>
      )}

      <section id="support" className={styles.section}>
        <div className={styles.sectionHead}><HeartHandshake size={15} /> Support</div>
        {data.support.campus && (data.support.campus.counsellorContact || data.support.campus.bookingUrl) && (
          <div className={ps.helpline}>
            <HeartHandshake size={20} style={{ color: 'var(--accent)' }} />
            <div className="stack" style={{ flex: 1, minWidth: 0 }}>
              <strong>{data.support.campus.counsellorName || 'Campus counsellor'}</strong>
              <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{[data.support.campus.hours, data.support.campus.counsellorContact].filter(Boolean).join(' · ')}</span>
            </div>
            {data.support.campus.bookingUrl && <a href={data.support.campus.bookingUrl} target="_blank" rel="noopener noreferrer"><Button size="sm">Book</Button></a>}
          </div>
        )}
        <div className="stack gap-2">
          {data.support.helplines.map((h) => (
            <a key={h.name} href={`tel:${h.phone.replace(/[^\d+]/g, '')}`} className={ps.helpline} style={{ color: 'inherit' }}>
              <Phone size={18} />
              <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                <strong>{h.name}</strong>
                <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{h.detail}</span>
              </div>
              <span className={ps.phone}>{h.phone}</span>
            </a>
          ))}
          <a href={`tel:${data.support.emergency.phone}`} className={ps.helpline} style={{ color: 'inherit', borderColor: 'var(--danger)' }}>
            <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
            <div className="stack" style={{ flex: 1 }}>
              <strong>In immediate danger?</strong>
              <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{data.support.campus?.emergencyContact ? `Campus: ${data.support.campus.emergencyContact} · ` : ''}National emergency number</span>
            </div>
            <span className={ps.phone}>{data.support.emergency.phone}</span>
          </a>
        </div>
      </section>
    </div>
  );
}

function CheckInForm({ data, onSaved }: { data: WellbeingData; onSaved: () => void }) {
  const toast = useToast();
  const [mood, setMood] = useState(data.today?.mood ?? 0);
  const [energy, setEnergy] = useState(data.today?.energy ?? 3);
  const [sleep, setSleep] = useState(data.today?.sleepHours != null ? String(data.today.sleepHours) : '');
  const [stressors, setStressors] = useState<string[]>(data.today?.stressors ?? []);
  const [note, setNote] = useState(data.today?.note ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/api/wellbeing', { mood, energy, ...(sleep ? { sleepHours: Number(sleep) } : {}), stressors, note });
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
      setSaving(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>How are you, really?</div>
      <div className={ps.moodScale} role="radiogroup" aria-label="Mood">
        {MOODS.map((m) => (
          <button key={m.value} role="radio" aria-checked={mood === m.value} className={cn(ps.moodButton, mood === m.value && ps.moodOn)} onClick={() => setMood(m.value)}>
            <span>{m.emoji}</span><span>{m.label}</span>
          </button>
        ))}
      </div>
      {mood > 0 && (
        <>
          <div className="stack gap-1">
            <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>Energy</span>
            <div className={ps.chips} role="radiogroup" aria-label="Energy">
              {ENERGY.map((label, i) => (
                <button key={label} role="radio" aria-checked={energy === i + 1} className={cn(ps.chip, energy === i + 1 && ps.chipOn)} onClick={() => setEnergy(i + 1)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="stack gap-1">
            <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>On your mind (optional)</span>
            <div className={ps.chips}>
              {data.stressors.map((s) => (
                <button key={s} aria-pressed={stressors.includes(s)} className={cn(ps.chip, stressors.includes(s) && ps.chipOn)}
                  onClick={() => setStressors(stressors.includes(s) ? stressors.filter((x) => x !== s) : stressors.length < 5 ? [...stressors, s] : stressors)}>{s}</button>
              ))}
            </div>
          </div>
          <div className="row gap-3 wrap" style={{ alignItems: 'flex-end' }}>
            <div style={{ width: 150 }}><Input label="Hours slept" optional type="number" min={0} max={24} step={0.5} value={sleep} onChange={(e) => setSleep(e.target.value)} /></div>
          </div>
          <Textarea label="Anything else" optional rows={3} placeholder="A private note, just for you." value={note} onChange={(e) => setNote(e.target.value)} />
          <div><Button onClick={save} loading={saving}>Save check-in</Button></div>
        </>
      )}
    </section>
  );
}

function MoodStrip({ history }: { history: CheckInView[] }) {
  const now = useNow();
  const byDay = new Map(history.map((h) => [h.day, h]));
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 86_400_000);
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  });
  return (
    <div className={ps.moodStrip} role="list" aria-label="Mood over the last 30 days">
      {days.map((day) => {
        const entry = byDay.get(day);
        return entry ? (
          <div key={day} role="listitem" className={ps.moodDay} style={{ height: `${entry.mood * 20}%`, opacity: 0.45 + entry.mood * 0.11 }} title={`${formatDate(day)}: ${MOODS[entry.mood - 1].label}`} aria-label={`${formatDate(day)}: ${MOODS[entry.mood - 1].label}`} />
        ) : (
          <div key={day} role="listitem" className={ps.moodEmpty} title={`${formatDate(day)}: no check-in`} aria-label={`${formatDate(day)}: no check-in`} />
        );
      })}
    </div>
  );
}
