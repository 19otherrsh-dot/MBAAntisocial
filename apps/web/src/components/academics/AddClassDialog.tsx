'use client';

import { useState } from 'react';
import { WEEKDAYS } from '@mba/shared/academics';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/client/api';
import type { CourseView } from './types';

export default function AddClassDialog({ courses, day, onClose, onSaved, onNewCourse }: { courses: CourseView[]; day?: number; onClose: () => void; onSaved: () => void; onNewCourse: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ course: courses[0]?._id ?? '', day: String(day ?? 0), start: '09:00', end: '10:30', room: '', kind: 'lecture' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { clash } = await api.post<{ clash: string | null }>('/api/academics/slots', { ...form, day: Number(form.day) });
      if (clash) toast.info('Added — note it overlaps', `Clashes with ${clash}.`);
      onSaved();
    } catch (caught) {
      toast.error('Could not add the class', errorMessage(caught));
      setBusy(false);
    }
  };

  if (courses.length === 0) {
    return (
      <Dialog open onClose={onClose} title="Add a class" footer={<Button onClick={onNewCourse}>Add a course first</Button>}>
        <p className="muted">Classes belong to a course. Add the course, then its weekly times.</p>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Add a weekly class"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Add</Button></>}>
      <Select label="Course" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} options={courses.map((c) => ({ value: c._id, label: `${c.code ? `${c.code} · ` : ''}${c.name}` }))} />
      <div className="row gap-3 wrap">
        <Select label="Day" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
        <Input label="Starts" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <Input label="Ends" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
      </div>
      <div className="row gap-3 wrap">
        <div style={{ flex: 1 }}><Input label="Room" optional placeholder="C-12" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></div>
        <Select label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: 'lecture', label: 'Lecture' }, { value: 'tutorial', label: 'Tutorial' }, { value: 'lab', label: 'Lab' }, { value: 'other', label: 'Other' }]} />
      </div>
    </Dialog>
  );
}
