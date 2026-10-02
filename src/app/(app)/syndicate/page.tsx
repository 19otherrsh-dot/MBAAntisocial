'use client';

import { useState } from 'react';
import { Handshake, Plus, CheckCircle2, CircleDollarSign } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, Chip, Avatar } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import { timeAgo } from '@/lib/utils';
import styles from '../app.module.css';

interface UserPopulated {
  _id: string;
  name: string;
  image?: string;
}

interface Bounty {
  _id: string;
  title: string;
  description: string;
  totalCost: number;
  slotsRequired: number;
  slotsFilled: UserPopulated[];
  category: 'subscription' | 'travel' | 'event' | 'other';
  status: 'open' | 'filled';
  owner: UserPopulated;
  createdAt: string;
}

export default function SyndicatePage() {
  const { me } = useMe();
  const [showAdd, setShowAdd] = useState(false);
  const { data, loading, error, refetch } = useApiQuery<{ bounties: Bounty[] }>('/api/bounties');
  const toast = useToast();

  const claimAction = useAction(async (bountyId: string) => {
    await api.patch('/api/bounties', { bountyId });
    toast.success('Slot Claimed', 'You are now part of the syndicate.');
    refetch();
  });

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>The Syndicate</h2>
          <p className={styles.pageSubtitle}>
            Form financial alliances. Split WSJ, PrepLounge, or that Airbnb to Aspen.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>
          Propose Split
        </Button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 400 }} />
      ) : data?.bounties.length === 0 ? (
        <EmptyState
          art={<Handshake size={40} strokeWidth={1.4} />}
          title="No open splits"
          body="Start a new syndicate and find people to split costs with."
          action={<Button variant="primary" onClick={() => setShowAdd(true)}>Propose a Split</Button>}
        />
      ) : (
        <div className={styles.cardList}>
          {data?.bounties.map((bounty) => {
            const isFilled = bounty.status === 'filled';
            const costPerPerson = (bounty.totalCost / bounty.slotsRequired).toFixed(2);
            const mySlot = bounty.slotsFilled.find(u => u._id === me?.id);
            const progressPct = Math.round((bounty.slotsFilled.length / bounty.slotsRequired) * 100);

            return (
              <article key={bounty._id} className={styles.slotCard} style={{ opacity: isFilled ? 0.7 : 1 }}>
                <div className={styles.slotMain}>
                  <div className={styles.slotTop}>
                    <Chip tone={isFilled ? 'slate' : 'amber'}>
                       {isFilled ? 'Filled' : `${bounty.slotsFilled.length} / ${bounty.slotsRequired} Filled`}
                    </Chip>
                    <Chip outline style={{ textTransform: 'capitalize' }}>{bounty.category}</Chip>
                    <Chip outline>{timeAgo(bounty.createdAt)}</Chip>
                  </div>

                  <div className={styles.slotPerson} style={{ marginTop: 'var(--s-3)' }}>
                    <Avatar name={bounty.owner.name} image={bounty.owner.image} seed={bounty.owner._id} size={36} />
                    <div>
                      <div className={styles.slotName}>{bounty.title}</div>
                      <div className={styles.slotRole}>Proposed by {bounty.owner._id === me?.id ? 'You' : bounty.owner.name}</div>
                    </div>
                  </div>

                  {bounty.description && <p className={styles.slotNote} style={{ marginTop: 'var(--s-3)' }}>{bounty.description}</p>}

                  <div style={{ marginTop: 'var(--s-4)', background: 'var(--bg)', padding: 'var(--s-3)', borderRadius: 'var(--r-md)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--s-2)' }}>
                        <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Total: ${bounty.totalCost}</span>
                        <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--accent)' }}>${costPerPerson} per person</span>
                     </div>
                     <div style={{ width: '100%', height: 6, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${progressPct}%`, height: '100%', background: isFilled ? 'var(--text-secondary)' : 'var(--accent)' }} />
                     </div>
                     
                     <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-3)', alignItems: 'center' }}>
                       {bounty.slotsFilled.map((user, idx) => (
                         <div key={idx} title={user.name}>
                           <Avatar name={user.name} image={user.image} seed={user._id} size={24} />
                         </div>
                       ))}
                       {Array.from({ length: bounty.slotsRequired - bounty.slotsFilled.length }).map((_, idx) => (
                         <div key={`empty-${idx}`} style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-sunken)', border: '1px dashed var(--line)' }} />
                       ))}
                     </div>
                  </div>

                  <div className={styles.slotActions} style={{ marginTop: 'var(--s-4)', justifyContent: 'flex-end' }}>
                    {isFilled ? (
                      <Button size="sm" variant="soft" disabled icon={<CheckCircle2 size={14} />}>Syndicate Closed</Button>
                    ) : mySlot ? (
                      <Button size="sm" variant="soft" disabled icon={<CheckCircle2 size={14} />}>You are in</Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<CircleDollarSign size={14} />}
                        loading={claimAction.pending}
                        onClick={() => claimAction.run(bounty._id)}
                      >
                        Claim Slot (${costPerPerson})
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {showAdd && (
        <CreateBountyDialog onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); refetch(); }} />
      )}
    </>
  );
}

function CreateBountyDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [slotsRequired, setSlotsRequired] = useState('4');
  const [category, setCategory] = useState<'subscription' | 'travel' | 'event' | 'other'>('subscription');

  const submit = useAction(async () => {
    await api.post('/api/bounties', {
      title: title.trim(),
      description: description.trim(),
      totalCost: parseInt(totalCost, 10),
      slotsRequired: parseInt(slotsRequired, 10),
      category,
    });
    toast.success('Syndicate created', 'Waiting for others to claim a slot.');
    onDone();
  });

  const canSubmit = title && totalCost && parseInt(slotsRequired, 10) >= 2;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Propose a Split"
      description="You automatically take the first slot. Once filled, you can collect Venmo/Zelle from the syndicate."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>Cancel</Button>
          <Button variant="primary" onClick={() => submit.run()} loading={submit.pending} disabled={!canSubmit}>
            Propose
          </Button>
        </>
      }
    >
      <Input label="What are you splitting?" placeholder="Wall Street Journal Annual Sub" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      
      <div className={styles.checkGrid}>
        <Input label="Total Cost (USD)" type="number" placeholder="200" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
        <Select label="Total People Needed" value={slotsRequired} onChange={(e) => setSlotsRequired(e.target.value)} options={['2','3','4','5','6','7','8'].map(v => ({ value: v, label: v }))} />
      </div>

      <Select 
        label="Category" 
        value={category} 
        onChange={(e) => setCategory(e.target.value as any)} 
        options={[
          { value: 'subscription', label: 'Subscription (News, Prep)' },
          { value: 'travel', label: 'Travel (Uber, Airbnb)' },
          { value: 'event', label: 'Event Tickets' },
          { value: 'other', label: 'Other' }
        ]} 
      />

      <Textarea
        label="Details"
        placeholder="Will share the login credentials once all 4 slots are filled and paid."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        optional
      />
    </Dialog>
  );
}
