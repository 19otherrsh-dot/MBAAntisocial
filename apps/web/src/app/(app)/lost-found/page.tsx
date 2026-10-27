'use client';

import { useState } from 'react';
import { CheckCircle2, MapPin, Plus, SearchX } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Textarea } from '@/components/ui/Field';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { cn, timeAgo, toDateTimeLocalValue } from '@/lib/utils';
import PhotoPicker from '@/components/campus/PhotoPicker';
import MessageButton from '@/components/campus/MessageButton';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface Item { _id: string; kind: 'lost' | 'found'; title: string; description: string; location: string; when: string; image: string; status: string; reporter: { _id: string; name: string }; mine: boolean; createdAt: string }

export default function LostFoundPage() {
  const toast = useToast();
  const [kind, setKind] = useState<'all' | 'lost' | 'found'>('all');
  const [resolved, setResolved] = useState(false);
  const [creating, setCreating] = useState<null | 'lost' | 'found'>(null);
  const [contacting, setContacting] = useState<Item | null>(null);
  const { data, refetch } = useApiQuery<{ items: Item[] }>('/api/lost-found', { kind: kind === 'all' ? undefined : kind, resolved: resolved || undefined });

  const act = async (item: Item, body: Record<string, unknown>, success: string) => {
    try {
      await api.post(`/api/lost-found/${item._id}`, body);
      toast.success(success);
      refetch();
      return true;
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
      return false;
    }
  };

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Lost & found</h1>
          <p className={styles.pageSubtitle}>Lost your ID card in the library? Found someone’s AirPods in the mess? Post it here.</p>
        </div>
        <div className="row gap-2">
          <Button icon={<Plus size={15} />} onClick={() => setCreating('lost')}>I lost something</Button>
          <Button variant="secondary" icon={<Plus size={15} />} onClick={() => setCreating('found')}>I found something</Button>
        </div>
      </div>
      <div className="row gap-3 wrap">
        <Segmented ariaLabel="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'lost', label: 'Lost' }, { value: 'found', label: 'Found' }]} />
        <Segmented ariaLabel="Status" value={resolved ? 'resolved' : 'open'} onChange={(v) => setResolved(v === 'resolved')} options={[{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Reunited' }]} />
      </div>
      {!data ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : data.items.length === 0 ? (
        <EmptyState art={<SearchX size={36} strokeWidth={1.4} />} title={resolved ? 'Nothing reunited yet' : 'Nothing lost right now'} body="Good news, probably." />
      ) : (
        <div className={cs.grid}>
          {data.items.map((i) => (
            <div key={i._id} className={cs.card}>
              {i.image && (
                <div className={cs.cover} style={{ aspectRatio: '4 / 3' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.image} alt="" loading="lazy" />
                </div>
              )}
              <div className={cs.cardBody}>
                <span className={cn(i.kind === 'lost' ? cs.kindLost : cs.kindFound)} style={{ fontSize: 'var(--t-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{i.kind}</span>
                <span className={cs.cardTitle}>{i.title}</span>
                {i.description && <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{i.description}</span>}
                <div className={cs.meta}>
                  {i.location && <span><MapPin size={12} /> {i.location}</span>}
                  <span>{timeAgo(i.when)}</span>
                  <span>by {i.mine ? 'you' : i.reporter.name}</span>
                </div>
                {i.status === 'resolved' ? <Chip tone="teal" icon={<CheckCircle2 size={12} />}>Reunited</Chip> : i.mine ? (
                  <Button size="sm" variant="secondary" onClick={() => act(i, { action: 'resolve' }, 'Marked as reunited')}>{i.kind === 'lost' ? 'I got it back' : 'Returned to owner'}</Button>
                ) : (
                  <div className="row gap-2 wrap">
                    <Button size="sm" onClick={() => setContacting(i)}>{i.kind === 'lost' ? 'I found this' : 'This is mine'}</Button>
                    <MessageButton userId={i.reporter._id} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <ReportDialog kind={creating} onClose={() => setCreating(null)} onCreated={() => { setCreating(null); refetch(); }} />}
      {contacting && <ContactDialog item={contacting} onClose={() => setContacting(null)} onSend={async (message) => { if (await act(contacting, { action: 'contact', message }, 'They have been notified')) setContacting(null); }} />}
    </div>
  );
}

function ReportDialog({ kind, onClose, onCreated }: { kind: 'lost' | 'found'; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', location: '', when: toDateTimeLocalValue(new Date()), images: [] as string[] });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/api/lost-found', { kind, title: form.title, description: form.description, location: form.location, when: new Date(form.when).toISOString(), image: form.images[0] ?? '' });
      onCreated();
    } catch (caught) {
      toast.error('Could not post it', errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={kind === 'lost' ? 'What did you lose?' : 'What did you find?'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={form.title.trim().length < 3}>Post</Button></>}>
      <Input label="Item" placeholder={kind === 'lost' ? 'Blue Casio calculator' : 'Black water bottle with stickers'} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="row gap-3 wrap">
        <div style={{ flex: 1, minWidth: 160 }}><Input label="Where" placeholder="Library, 2nd floor" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <Input label="When" type="datetime-local" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
      </div>
      <Textarea label="Details" optional rows={2} placeholder={kind === 'found' ? 'Leave out one detail only the owner would know.' : ''} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <PhotoPicker value={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} folder="posts" max={1} />
    </Dialog>
  );
}

function ContactDialog({ item, onClose, onSend }: { item: Item; onClose: () => void; onSend: (message: string) => void }) {
  const [message, setMessage] = useState('');
  return (
    <Dialog open onClose={onClose} title={item.kind === 'lost' ? 'You found it?' : 'Is it yours?'} description={`${item.reporter.name} gets a notification with your message and name.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => onSend(message)} disabled={message.trim().length < 3}>Send</Button></>}>
      <Textarea label="Message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={item.kind === 'lost' ? 'I found it near the canteen — it’s with the security desk.' : 'It has my initials scratched on the cap.'} />
    </Dialog>
  );
}
