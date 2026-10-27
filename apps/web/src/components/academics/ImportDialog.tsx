'use client';

import { useRef, useState } from 'react';
import { Sparkles, Trash2, Upload } from 'lucide-react';
import { WEEKDAYS } from '@mba/shared/academics';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/client/api';

interface Extracted { code: string; name: string; professor: string; slots: Array<{ day: number; start: string; end: string; room: string }> }

/** Screenshot or PDF in, editable preview out, then one click to save. */
export default function ImportDialog({ defaultTerm, onClose, onImported }: { defaultTerm: string; onClose: () => void; onImported: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Extracted[] | null>(null);
  const [notes, setNotes] = useState('');
  const [term, setTerm] = useState(defaultTerm);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/academics/import', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not read that file.');
      setPreview(body.courses);
      setNotes(body.notes);
    } catch (caught) {
      toast.error('Could not read the timetable', caught instanceof Error ? caught.message : undefined);
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const { courses, slots } = await api.post<{ courses: number; slots: number }>('/api/academics/import/apply', { term, courses: preview });
      toast.success(`Added ${courses} courses and ${slots} classes`);
      onImported();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Import your timetable" description="Upload a screenshot, photo, or PDF. You review everything before it is saved."
      footer={preview ? <><Button variant="ghost" onClick={() => setPreview(null)}>Start over</Button><Button onClick={save} loading={saving} disabled={preview.length === 0}>Save {preview.length} courses</Button></> : <Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      {!preview ? (
        <div className="stack gap-3" style={{ alignItems: 'center', padding: 'var(--s-5) 0' }}>
          <Sparkles size={30} style={{ color: 'var(--accent)' }} />
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => read(e.target.files?.[0])} />
          <Button icon={<Upload size={15} />} loading={reading} onClick={() => fileRef.current?.click()}>{reading ? 'Reading your timetable…' : 'Choose a file'}</Button>
          <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>PNG, JPEG, WebP, or PDF up to 6 MB.</span>
        </div>
      ) : (
        <div className="stack gap-3">
          {notes && <Banner variant="warning" title="Double-check">{notes}</Banner>}
          <Input label="Term" value={term} onChange={(e) => setTerm(e.target.value)} />
          {preview.length === 0 && <p className="dim">No classes found. Try a clearer screenshot.</p>}
          {preview.map((c, i) => (
            <div key={i} className="row gap-2" style={{ alignItems: 'flex-start', padding: 10, border: '1px solid var(--line)', borderRadius: 10 }}>
              <div className="stack gap-1" style={{ flex: 1, minWidth: 0 }}>
                <strong>{c.code ? `${c.code} · ` : ''}{c.name}</strong>
                <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
                  {c.slots.map((s) => `${WEEKDAYS[s.day]} ${s.start}–${s.end}${s.room ? ` (${s.room})` : ''}`).join(' · ')}
                </span>
              </div>
              <button aria-label={`Remove ${c.name}`} className="dim" onClick={() => setPreview(preview.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
