'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Flag, Plus, Search, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { ClubLogo, CLUB_CATEGORY_LABEL } from '@/components/campus/clubs';
import Morph from '@/components/motion/Morph';
import Spotlight from '@/components/motion/Spotlight';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface ClubRow { _id: string; slug: string; name: string; tagline: string; category: string; logo: string; official: boolean; memberCount: number; recruiting: boolean; myRole: string | null }

export default function ClubsPage() {
  const router = useRouter();
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const query = useDebounced(q, 250);
  const [creating, setCreating] = useState(false);
  const { data } = useApiQuery<{ clubs: ClubRow[] }>('/api/clubs', { mine: scope === 'mine' || undefined, category: category || undefined, q: query || undefined });

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Clubs</h1>
          <p className={styles.pageSubtitle}>Find your people, apply when recruitment opens, and run your club’s events, budget, and tasks.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>Start a club</Button>
      </div>
      <div className="row gap-3 wrap">
        <Segmented ariaLabel="Which clubs" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All clubs' }, { value: 'mine', label: 'My clubs' }]} />
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: 'All categories' }, ...Object.entries(CLUB_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]} />
        <div style={{ flex: '1 1 200px', maxWidth: 280 }}><Input aria-label="Search clubs" placeholder="Search clubs" icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!data ? (
        <div className={cs.grid}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 150, borderRadius: 20 }} />)}</div>
      ) : data.clubs.length === 0 ? (
        <EmptyState art={<Flag size={36} strokeWidth={1.4} />} title={scope === 'mine' ? 'You have not joined a club yet' : 'No clubs yet'} body="Start one — it comes with its own hub server, events, and a budget tracker." action={<Button onClick={() => setCreating(true)}>Start a club</Button>} />
      ) : (
        <Spotlight>
        <div className={cs.grid} data-reveal="">
          {data.clubs.map((c) => (
            <Link key={c._id} href={`/clubs/${c.slug}`} className={cs.card} data-spot="">
              <div className={cs.cardBody} style={{ paddingTop: 'var(--s-4)' }}>
                <div className={cs.head}>
                  <Morph name={`club-logo-${c.slug}`}><ClubLogo name={c.name} logo={c.logo} /></Morph>
                  <div className="stack" style={{ minWidth: 0 }}>
                    <span className={cs.cardTitle}>{c.name} {c.official && <BadgeCheck size={15} style={{ color: 'var(--accent)', verticalAlign: '-2px' }} aria-label="Official" />}</span>
                    <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{CLUB_CATEGORY_LABEL[c.category]}</span>
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 'var(--t-sm)', minHeight: '2.6em' }}>{c.tagline}</span>
                <div className={cs.meta}>
                  <span><Users size={12} /> {c.memberCount}</span>
                  {c.recruiting && <Chip tone="teal">Recruiting</Chip>}
                  {c.myRole && <Chip tone="violet">{c.myRole === 'member' ? 'Member' : c.myRole === 'core' ? 'Core team' : 'Lead'}</Chip>}
                </div>
              </div>
            </Link>
          ))}
        </div>
        </Spotlight>
      )}
      {creating && <CreateClubDialog onClose={() => setCreating(false)} onCreated={(slug) => router.push(`/clubs/${slug}`)} />}
    </div>
  );
}

function CreateClubDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', tagline: '', description: '', category: 'professional' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { club } = await api.post<{ club: { slug: string } }>('/api/clubs', form);
      onCreated(club.slug);
    } catch (caught) {
      toast.error('Could not create the club', errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Start a club" description="You become its lead. It gets a hub server for chat and a page for events and recruitment."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={form.name.trim().length < 3}>Create</Button></>}>
      <Input label="Name" placeholder="Finance & Investment Club" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input label="Tagline" optional placeholder="Stock pitches every Friday" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
      <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={Object.entries(CLUB_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
      <Textarea label="What you do" optional rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </Dialog>
  );
}
