'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Calculator, Plus, Trash2, BookPlus } from 'lucide-react';
import { GRADE_SCALES, type GradeScaleKey } from '@mba/shared/academics';
import Button from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { EmptyState, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import CourseDialog from '@/components/academics/CourseDialog';
import type { AcademicsData, Component, CourseView } from '@/components/academics/types';
import ac from '@/components/academics/academics.module.css';
import styles from '../app.module.css';

export default function GradesPage() {
  const toast = useToast();
  const [term, setTerm] = useState<string | undefined>(undefined);
  const { data, refetch } = useApiQuery<AcademicsData>('/api/academics', term !== undefined ? { term } : undefined);
  const [adding, setAdding] = useState(false);

  const setScale = async (gradeScale: GradeScaleKey) => {
    try {
      await api.patch('/api/academics/settings', { gradeScale });
      refetch();
    } catch (caught) {
      toast.error('Could not change the scale', errorMessage(caught));
    }
  };

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Grades & CGPA</h1>
          <p className={styles.pageSubtitle}>Enter component scores as they come in. See your standing and what you need on the rest.</p>
        </div>
        <div className="row gap-2 wrap">
          {data && data.terms.length > 1 && (
            <Select aria-label="Term" value={term ?? data.settings.currentTerm} onChange={(e) => setTerm(e.target.value)} options={[{ value: '', label: 'All terms' }, ...data.terms.map((t) => ({ value: t, label: t }))]} />
          )}
          {data && <Select aria-label="Grade scale" value={data.scale} onChange={(e) => setScale(e.target.value as GradeScaleKey)} options={Object.entries(GRADE_SCALES).map(([k, v]) => ({ value: k, label: v.label }))} />}
          <Button variant="secondary" icon={<BookPlus size={15} />} onClick={() => setAdding(true)}>Add course</Button>
        </div>
      </div>

      {!data ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : data.courses.length === 0 ? (
        <EmptyState art={<Calculator size={36} strokeWidth={1.4} />} title="No courses yet" body="Add courses here or import your timetable — grades and attendance share the same course list." action={<Link href="/timetable"><Button>Set up courses</Button></Link>} />
      ) : (
        <>
          <div className="row gap-5 wrap">
            <Stat value={data.termGpa !== null ? data.termGpa.toFixed(2) : '—'} label="Term GPA" meta={`out of ${GRADE_SCALES[data.scale].max}`} />
            <Stat value={data.cgpa !== null ? data.cgpa.toFixed(2) : '—'} label="CGPA" meta="all graded courses" />
            <Stat value={data.courses.reduce((n, c) => n + c.credits, 0)} label="Credits this term" />
          </div>
          <div className={ac.courses} data-reveal="">
            {data.courses.map((c) => <GradeCard key={c._id} course={c} scale={data.scale} onSaved={refetch} />)}
          </div>
        </>
      )}
      {adding && <CourseDialog defaultTerm={data?.settings.currentTerm ?? ''} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refetch(); }} />}
    </div>
  );
}

function GradeCard({ course, scale, onSaved }: { course: CourseView; scale: GradeScaleKey; onSaved: () => void }) {
  const toast = useToast();
  const [components, setComponents] = useState<Component[]>(course.components);
  const [grade, setGrade] = useState(course.grade);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(components) !== JSON.stringify(course.components) || grade !== course.grade;
  const totalWeight = useMemo(() => components.reduce((n, c) => n + (Number(c.weight) || 0), 0), [components]);

  const update = (i: number, patch: Partial<Component>) => setComponents(components.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/academics/courses/${course._id}`, {
        components: components.filter((c) => c.name.trim()).map((c) => ({ name: c.name, weight: Number(c.weight) || 0, max: Number(c.max) || 100, ...(c.score !== undefined && String(c.score) !== '' ? { score: Number(c.score) } : {}) })),
        grade,
      });
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const g = course.grades;
  return (
    <div className={ac.courseCard} style={{ borderTopColor: course.color }}>
      <div className="row gap-2" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ minWidth: 0 }}>
          <strong className="truncate">{course.name}</strong>
          <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{[course.code, `${course.credits} credits`, course.professor].filter(Boolean).join(' · ')}</span>
        </div>
        <Select aria-label="Final grade" value={grade} onChange={(e) => setGrade(e.target.value)} options={[{ value: '', label: 'No grade yet' }, ...Object.keys(GRADE_SCALES[scale].grades).map((k) => ({ value: k, label: k }))]} />
      </div>

      {g.currentPercent !== null && (
        <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>
          <strong>{g.currentPercent}%</strong> on the {g.gradedWeight}% graded so far · {g.earned} of 100 points banked
        </span>
      )}

      <div className="stack gap-1">
        <div className={ac.compRow} style={{ fontSize: 'var(--t-xs)', color: 'var(--text-muted)' }}><span>Component</span><span>Weight %</span><span>Score</span><span>Out of</span><span /></div>
        {components.map((c, i) => (
          <div key={i} className={ac.compRow}>
            <input aria-label="Component name" value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Mid-term" />
            <input aria-label="Weight" type="number" min={0} max={100} value={c.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} />
            <input aria-label="Score" type="number" min={0} value={c.score ?? ''} onChange={(e) => update(i, { score: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="—" />
            <input aria-label="Out of" type="number" min={1} value={c.max} onChange={(e) => update(i, { max: Number(e.target.value) })} />
            <button aria-label={`Remove ${c.name || 'component'}`} className="dim" onClick={() => setComponents(components.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        <div className="row gap-2">
          <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setComponents([...components, { name: '', weight: 0, max: 100 }])} disabled={components.length >= 12}>Component</Button>
          {totalWeight !== 100 && components.length > 0 && <span className={totalWeight > 100 ? ac.bad : 'dim'} style={{ fontSize: 'var(--t-xs)' }}>Weights total {totalWeight}%</span>}
        </div>
      </div>

      {g.pendingWeight > 0 && g.gradedWeight > 0 && (
        <div className="stack gap-1">
          <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Needed on the remaining {g.pendingWeight}% to finish at…</span>
          <div className={ac.need}>
            {Object.entries(g.neededFor).map(([target, need]) => (
              <div key={target} className={ac.needCell}>
                {target}%
                <strong className={need === null ? '' : need > 100 ? ac.bad : need <= 0 ? ac.good : ''}>{need === null ? '—' : need > 100 ? 'Out of reach' : need <= 0 ? 'Secured' : `${Math.ceil(need)}%`}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {dirty && <Button size="sm" onClick={save} loading={saving}>Save</Button>}
    </div>
  );
}
