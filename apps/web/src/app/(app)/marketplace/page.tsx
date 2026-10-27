'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Heart, Plus, Rocket, Search, ShoppingBag, Tag } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { timeAgo } from '@/lib/utils';
import PhotoPicker from '@/components/campus/PhotoPicker';
import MessageButton from '@/components/campus/MessageButton';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

const CATEGORY_LABEL: Record<string, string> = { books: 'Books', electronics: 'Electronics', cycles: 'Cycles', furniture: 'Furniture', clothing: 'Clothing', sublet: 'Sublets', tickets: 'Tickets', other: 'Other' };
const CONDITION_LABEL: Record<string, string> = { new: 'New', 'like-new': 'Like new', good: 'Good', fair: 'Fair' };

interface ListingView {
  _id: string; title: string; description: string; category: string; price: number; negotiable: boolean; condition: string; images: string[]; status: string;
  seller: { _id: string; name: string; image: string; batch: string }; isSeller: boolean; interestedCount: number; imInterested: boolean; boosted: boolean; boostedUntil?: string | null; createdAt: string;
}

const price = (n: number) => (n === 0 ? 'Free' : `₹${n.toLocaleString('en-IN')}`);

export default function MarketplacePage() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}><Marketplace /></Suspense>;
}

function Marketplace() {
  const params = useSearchParams();
  const router = useRouter();
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const query = useDebounced(q, 250);
  const [creating, setCreating] = useState(false);
  const { data, refetch } = useApiQuery<{ listings: ListingView[] }>('/api/marketplace', { mine: scope === 'mine' || undefined, category: category || undefined, q: query || undefined });
  const openId = params.get('listing');
  const open = data?.listings.find((l) => l._id === openId) ?? null;

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Marketplace</h1>
          <p className={styles.pageSubtitle}>Books, cycles, coolers, sublets — buy and sell with people on your own campus.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>Sell something</Button>
      </div>
      <div className="row gap-3 wrap">
        <Segmented ariaLabel="Which listings" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Browse' }, { value: 'mine', label: 'My listings' }]} />
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: 'Everything' }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]} />
        <div style={{ flex: '1 1 200px', maxWidth: 300 }}><Input aria-label="Search listings" placeholder="Search" icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!data ? (
        <div className={cs.grid}>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 280, borderRadius: 20 }} />)}</div>
      ) : data.listings.length === 0 ? (
        <EmptyState art={<ShoppingBag size={36} strokeWidth={1.4} />} title={scope === 'mine' ? 'You are not selling anything' : 'Nothing listed yet'} body="Post the thing gathering dust — it takes a minute." action={<Button onClick={() => setCreating(true)}>Sell something</Button>} />
      ) : (
        <div className={cs.grid} data-reveal="">
          {data.listings.map((l) => (
            <button key={l._id} className={cs.card} onClick={() => router.push(`/marketplace?listing=${l._id}`, { scroll: false })}>
              <div className={cs.cover} style={{ aspectRatio: '4 / 3' }}>
                {l.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.images[0]} alt="" loading="lazy" />
                ) : <Tag size={32} strokeWidth={1.3} className="dim" />}
                {l.boosted && <span style={{ position: 'absolute', top: 10, left: 10 }}><Chip tone="amber" icon={<Rocket size={11} />}>Featured</Chip></span>}
                {l.status !== 'active' && <span style={{ position: 'absolute', top: 10, right: 10 }}><Chip tone="slate">{l.status === 'reserved' ? 'Reserved' : 'Sold'}</Chip></span>}
              </div>
              <div className={cs.cardBody}>
                <span className={cs.price}>{price(l.price)}{l.negotiable && l.price > 0 && <span className="dim" style={{ fontSize: 'var(--t-xs)', fontWeight: 500 }}> · negotiable</span>}</span>
                <span className={cs.cardTitle}>{l.title}</span>
                <div className={cs.meta}><span>{CATEGORY_LABEL[l.category]}</span><span>{CONDITION_LABEL[l.condition]}</span><span>{timeAgo(l.createdAt)}</span>{l.interestedCount > 0 && <span><Heart size={11} /> {l.interestedCount}</span>}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && <ListingDialog listing={open} onClose={() => router.push('/marketplace', { scroll: false })} onChanged={refetch} />}
      {creating && <CreateListingDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setScope('mine'); refetch(); }} />}
    </div>
  );
}

function ListingDialog({ listing, onClose, onChanged }: { listing: ListingView; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { me, refresh } = useMe();
  const act = async (body: Record<string, unknown>, success?: string) => {
    try {
      await api.post(`/api/marketplace/${listing._id}`, body);
      if (success) toast.success(success);
      onChanged();
      if (body.action === 'boost') void refresh?.();
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title={listing.title} description={`${price(listing.price)} · ${CONDITION_LABEL[listing.condition]} · ${CATEGORY_LABEL[listing.category]}`}>
      {listing.images.length > 0 && (
        <div className={cs.gallery}>
          {listing.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
            </a>
          ))}
        </div>
      )}
      {listing.description && <p style={{ whiteSpace: 'pre-wrap' }}>{listing.description}</p>}
      <div className="row gap-2">
        <Avatar name={listing.seller.name} image={listing.seller.image} seed={listing.seller._id} size={30} />
        <div className="stack" style={{ flex: 1 }}><strong>{listing.seller.name}</strong><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{listing.seller.batch} · listed {timeAgo(listing.createdAt)}</span></div>
      </div>
      {listing.isSeller ? (
        <div className="stack gap-2">
          <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>{listing.interestedCount} interested</span>
          <div className="row gap-2 wrap">
            {listing.status !== 'reserved' && listing.status !== 'sold' && <Button size="sm" variant="secondary" onClick={() => act({ action: 'status', status: 'reserved' }, 'Marked reserved')}>Mark reserved</Button>}
            {listing.status !== 'sold' && <Button size="sm" onClick={() => act({ action: 'status', status: 'sold' }, 'Marked sold — nice!')}>Mark sold</Button>}
            {listing.status !== 'active' && <Button size="sm" variant="ghost" onClick={() => act({ action: 'status', status: 'active' })}>Relist</Button>}
            <Button size="sm" variant="ghost" onClick={() => { void act({ action: 'status', status: 'removed' }, 'Listing removed'); onClose(); }}>Remove</Button>
          </div>
          {listing.status === 'active' && (
            <Banner variant="info" icon={<Rocket size={16} />} title={listing.boosted ? 'Featured' : 'Feature this listing'}
              action={<Button size="sm" variant="secondary" onClick={() => act({ action: 'boost' }, 'Featured for 3 days')}>Feature · 5 credits</Button>}>
              Pins it to the top for three days. You have {me?.credits ?? 0} credits — earn them by hosting mock sessions.
            </Banner>
          )}
        </div>
      ) : (
        <div className="row gap-2 wrap">
          <Button icon={<Heart size={15} />} variant={listing.imInterested ? 'secondary' : 'primary'} onClick={() => act({ action: 'interested', interested: !listing.imInterested }, listing.imInterested ? undefined : 'The seller has been told')}>
            {listing.imInterested ? 'Interested ✓' : 'I’m interested'}
          </Button>
          <MessageButton userId={listing.seller._id} label="Message seller" size="md" />
        </div>
      )}
    </Dialog>
  );
}

function CreateListingDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', category: 'books', price: '', negotiable: true, condition: 'good', images: [] as string[] });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/api/marketplace', { ...form, price: Number(form.price) || 0 });
      toast.success('Listed', 'People on campus can see it now.');
      onCreated();
    } catch (caught) {
      toast.error('Could not list it', errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Sell something" description="Only people on your campus see it. Posting lets buyers message you."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={form.title.trim().length < 3}>List it</Button></>}>
      <Input label="What is it?" placeholder="Kotler Marketing Management, 16th ed." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="row gap-3 wrap">
        <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select label="Condition" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} options={Object.entries(CONDITION_LABEL).map(([value, label]) => ({ value, label }))} />
        <div style={{ width: 130 }}><Input label="Price (₹)" type="number" min={0} placeholder="0 = free" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
      </div>
      <Switch checked={form.negotiable} onChange={(negotiable) => setForm({ ...form, negotiable })} label="Open to offers" />
      <Textarea label="Details" optional rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <PhotoPicker value={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} folder="marketplace" />
    </Dialog>
  );
}
