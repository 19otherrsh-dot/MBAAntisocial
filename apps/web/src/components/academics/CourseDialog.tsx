'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import type { CourseView } from './types';

export const COURSE_COLORS = ['#5b4bdb', '#0c8599', '#d9480f', '#2b8a3e', '#c2255c', '#e67700', '#1971c2', '#6741d9', '#087f5b', '#a61e4d'];

/** Create or edit a course's basics. Components and grades are edited on the grades page. */
export default function CourseDialog({ course, defaultTerm, onClose, onSaved }: { course?: CourseView | null; defaultTerm: string; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    code: course?.code ?? '',
    name: course?.name ?? '',
    professor: course?.professor ?? '',
    term: course?.term ?? defaultTerm,
    credits: String(course?.credits ?? 3),
    requiredAttendance: String(course?.requiredAttendance ?? 75),
    plannedSessions: course?.plannedSessions ? String(course.plannedSessions) : '',
    color: course?.color ?? COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)],
  }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const body = {
      code: form.code,
      name: form.name,
      professor: form.professor,
      term: form.term,
      credits: Number(form.credits) || 0,
      requiredAttendance: Number(form.requiredAttendance) || 0,
      ...(form.plannedSessions ? { plannedSessions: Number(form.plannedSessions) } : {}),
      color: form.color,
    };
    try {
      const { course: saved } = course
        ? await api.patch<{ course: { _id: string } }>(`/api/academics/courses/${course._id}`, body)
        : await api.post<{ course: { _id: string } }>('/api/academics/courses', body);
      onSaved(saved._id);
    } catch (caught) {
      toast.error('Could not save the course', errorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={course ? 'Edit course' : 'Add a course'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!form.name.trim()}>Save</Button></>}>
      <div className="row gap-3">
        <div style={{ width: 120 }}><Input label="Code" placeholder="FIN-501" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div style={{ flex: 1 }}><Input label="Name" placeholder="Corporate Finance" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      </div>
      <div className="row gap-3 wrap">
        <div style={{ flex: 1, minWidth: 160 }}><Input label="Professor" optional value={form.professor} onChange={(e) => setForm({ ...form, professor: e.target.value })} /></div>
        <div style={{ width: 130 }}><Input label="Term" placeholder="Term 3" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} /></div>
      </div>
      <div className="row gap-3 wrap">
        <div style={{ width: 100 }}><Input label="Credits" type="number" min={0} step={0.5} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} /></div>
        <div style={{ width: 150 }}><Input label="Attendance bar %" type="number" min={0} max={100} value={form.requiredAttendance} onChange={(e) => setForm({ ...form, requiredAttendance: e.target.value })} /></div>
        <div style={{ width: 150 }}><Input label="Sessions in term" optional type="number" min={0} value={form.plannedSessions} onChange={(e) => setForm({ ...form, plannedSessions: e.target.value })} hint="For “can I still make it”" /></div>
      </div>
      <div className="row gap-2" role="radiogroup" aria-label="Colour">
        {COURSE_COLORS.map((c) => (
          <button key={c} role="radio" aria-checked={form.color === c} aria-label={c} onClick={() => setForm({ ...form, color: c })}
            style={{ width: 26, height: 26, borderRadius: 999, background: c, outline: form.color === c ? '3px solid var(--text)' : 'none', outlineOffset: 2 }} />
        ))}
      </div>
    </Dialog>
  );
}
