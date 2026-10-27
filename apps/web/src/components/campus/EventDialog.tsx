'use client';

import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { uploadFile } from '@/lib/client/upload';
import { toDateTimeLocalValue } from '@/lib/utils';

export const EVENT_CATEGORY_LABEL: Record<string, string> = { talk: 'Talk', workshop: 'Workshop', fest: 'Fest', sports: 'Sports', social: 'Social', career: 'Career', club: 'Club', other: 'Other' };

/** Create an event; club leads can post on behalf of their club. */
export default function EventDialog({ onClose, onCreated, defaultClub }: { onClose: () => void; onCreated: (id: string) => void; defaultClub?: string }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: clubs } = useApiQuery<{ clubs: Array<{ _id: string; name: string; myRole: string | null }> }>('/api/clubs', { mine: true });
  const manageable = (clubs?.clubs ?? []).filter((c) => c.myRole === 'lead' || c.myRole === 'core');
  const [form, setForm] = useState(() => {
    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setHours(18, 0, 0, 0);
    return { title: '', description: '', category: 'talk', club: defaultClub ?? '', startAt: toDateTimeLocalValue(start), endAt: toDateTimeLocalValue(new Date(start.getTime() + 90 * 60_000)), venue: '', onlineUrl: '', capacity: '', coverImage: '' };
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { event } = await api.post<{ event: { _id: string } }>('/api/events', {
        ...form,
        club: form.club || undefined,
        capacity: Number(form.capacity) || 0,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      });
      onCreated(event._id);
    } catch (caught) {
      toast.error('Could not create the event', errorMessage(caught));
      setBusy(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file, 'events');
      setForm((f) => ({ ...f, coverImage: url }));
    } catch (caught) {
      toast.error('Upload failed', caught instanceof Error ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Host an event" description="Everyone on campus can find it, RSVP, and add it to their calendar."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={form.title.trim().length < 3}>Publish</Button></>}>
      <Input label="Title" placeholder="Fireside chat with a PE partner" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="row gap-3 wrap">
        <Select label="Type" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={Object.entries(EVENT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
        {manageable.length > 0 && <Select label="On behalf of" value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })} options={[{ value: '', label: 'Just me' }, ...manageable.map((c) => ({ value: c._id, label: c.name }))]} />}
      </div>
      <div className="row gap-3 wrap">
        <Input label="Starts" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
        <Input label="Ends" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
      </div>
      <div className="row gap-3 wrap">
        <div style={{ flex: 1, minWidth: 180 }}><Input label="Venue" placeholder="Auditorium, Wing C" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></div>
        <div style={{ width: 130 }}><Input label="Capacity" optional type="number" min={0} placeholder="No limit" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
      </div>
      <Input label="Online link" optional placeholder="https://meet.google.com/…" value={form.onlineUrl} onChange={(e) => setForm({ ...form, onlineUrl: e.target.value })} hint="Only shown to people who RSVP." />
      <Textarea label="Details" optional rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => upload(e.target.files?.[0])} />
      <div className="row gap-2">
        <Button size="sm" variant="ghost" icon={<ImagePlus size={14} />} loading={uploading} onClick={() => fileRef.current?.click()}>{form.coverImage ? 'Change cover' : 'Add a cover image'}</Button>
        {form.coverImage && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Cover added</span>}
      </div>
    </Dialog>
  );
}
