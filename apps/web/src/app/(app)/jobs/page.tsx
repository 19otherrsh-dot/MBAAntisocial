'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, Building, Send, Plus, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Textarea, Select, Switch } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api, ApiClientError } from '@/lib/client/api';
import {
  OPPORTUNITY_KINDS,
  OPPORTUNITY_KIND_META,
  COMMITMENT_LEVELS,
  COMMITMENT_META,
  type OpportunityKind,
  type CommitmentLevel,
} from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import styles from '../app.module.css';

interface JobAuthor {
  _id: string;
  name: string;
  image?: string;
  campus: string;
  batch: string;
  role: string;
}

interface JobRow {
  _id: string;
  author: JobAuthor;
  title: string;
  kind: OpportunityKind;
  org: string;
  description: string;
  commitment: CommitmentLevel;
  link: string;
  invitesContact: boolean;
  closesAt?: string;
  isOwn: boolean;
  createdAt: string;
}

interface JobsResponse {
  jobs: JobRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

type KindFilter = OpportunityKind | 'all';

export default function JobsPage() {
  const { me } = useMe();
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [kind, setKind] = useState<KindFilter>('all');
  const [creating, setCreating] = useState(false);

  const { data, loading, error, refetch } = useApiQuery<JobsResponse>('/api/jobs', { kind });

  const jobs = data?.jobs ?? [];

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete this post?',
      body: 'It disappears from the board for everyone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await api.delete(`/api/jobs?id=${id}`);
      toast.success('Post deleted');
      refetch();
    } catch (err) {
      // Surface what actually went wrong rather than a generic failure line —
      // the API already returns a usable message.
      toast.error('Could not delete that', err instanceof Error ? err.message : undefined);
    }
  };

  const requestReferral = async (authorId: string, company: string) => {
    // Optimistically send a message to start the DM, then redirect
    try {
      await api.post('/api/messages', {
        receiverId: authorId,
        content: `Hi! I saw your post for a role at ${company} and I'd love to request a referral. Let me know what you need from me.`,
      });
      router.push('/messages');
    } catch (err) {
      toast.error(
        'Could not start that conversation',
        err instanceof Error ? err.message : undefined
      );
    }
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Campus opportunities</h2>
          <p className={styles.pageSubtitle}>
            Club roles, TA positions, live projects, and alumni referrals — from {me?.campus ?? 'your campus'}.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          Post something
        </Button>
      </div>

      <Banner variant="info">
        Deliberately not a job board. External listings are somebody else&rsquo;s game and they do
        it at a scale we never will — this is the supply that only exists here, and that no
        placement portal lists.
      </Banner>

      <Segmented
        ariaLabel="Opportunity kinds"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'all' as const, label: 'Everything' },
          ...OPPORTUNITY_KINDS.map((value) => ({
            value,
            label: OPPORTUNITY_KIND_META[value].label,
          })),
        ]}
      />

      {error && <Banner variant="danger">{error}</Banner>}

      {loading ? (
        <div className="skeleton" style={{ height: 400 }} />
      ) : jobs.length === 0 ? (
        <EmptyState
          art={<Briefcase size={40} strokeWidth={1.4} />}
          title="Nothing open right now"
          body="Clubs recruit in bursts and TA slots open at the start of a term. If you are the one recruiting, post it — this is the only place it will reach your whole batch."
          action={<Button onClick={() => setCreating(true)}>Post something</Button>}
        />
      ) : (
        <div className={styles.cardList}>
          {jobs.map((job) => (
            <article key={job._id} className={styles.slotCard}>
              <div className={styles.slotMain}>
                <div className={styles.appTop}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className={styles.appCompany}>{job.title}</h3>
                    {job.org && (
                      <p className={styles.appRole}>
                        <Building size={13} style={{ display: 'inline', marginRight: 4 }} />
                        {job.org}
                      </p>
                    )}
                  </div>
                  <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
                    <Chip tone={OPPORTUNITY_KIND_META[job.kind].tone}>
                      {OPPORTUNITY_KIND_META[job.kind].label}
                    </Chip>
                    <Chip outline>{COMMITMENT_META[job.commitment].label}</Chip>
                  </div>
                </div>

                <div className={styles.slotPerson}>
                  <Avatar name={job.author.name} image={job.author.image} seed={job.author._id} size={32} />
                  <div>
                    <div className={styles.slotName}>{job.author.name}</div>
                    <div className={styles.slotRole}>
                      {job.author.role === 'alumni' ? `Alum · ${job.author.batch}` : job.author.batch}
                    </div>
                  </div>
                </div>

                <p style={{ margin: '12px 0', fontSize: '0.9375rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {job.description}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Posted {timeAgo(job.createdAt)}
                  </div>
                  
                  <div className="row gap-2 wrap">
                    {job.isOwn ? (
                      <Button
                        size="sm"
                        variant="dangerGhost"
                        icon={<Trash2 size={14} />}
                        onClick={() => handleDelete(job._id)}
                      >
                        Take it down
                      </Button>
                    ) : (
                      <>
                        {job.link && (
                          <Link href={job.link} target="_blank" rel="noreferrer noopener">
                            <Button size="sm" variant="secondary">
                              Details
                            </Button>
                          </Link>
                        )}
                        {/* Posting with "happy to be contacted" is the explicit
                            opt-in the messaging gate honours, so this button is
                            never a cold DM. */}
                        {job.invitesContact && (
                          <Button
                            size="sm"
                            icon={<Send size={14} />}
                            onClick={() => requestReferral(job.author._id, job.org || job.title)}
                          >
                            Get in touch
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <CreateJobDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refetch(); }} />
      )}

      {confirmDialog}
    </>
  );
}

function CreateJobDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { me } = useMe();

  const [form, setForm] = useState({
    title: '',
    kind: 'club_role' as OpportunityKind,
    org: '',
    description: '',
    commitment: 'moderate' as CommitmentLevel,
    link: '',
    invitesContact: true,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      await api.post('/api/jobs', form);
      onCreated();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldErrors(caught.fieldErrors);
        if (Object.keys(caught.fieldErrors).length === 0) setError(caught.message);
      } else {
        setError('Could not post that.');
      }
    } finally {
      setPending(false);
    }
  };

  const meta = OPPORTUNITY_KIND_META[form.kind];
  const canPostReferral = me?.role === 'alumni' || me?.role === 'admin' || me?.role === 'moderator';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Post an opportunity"
      description="Something on campus that needs people. Your batch sees it; nobody else does."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={pending}
            disabled={!form.title.trim() || form.description.trim().length < 10}
          >
            Post it
          </Button>
        </>
      }
    >
      {error && <Banner variant="danger">{error}</Banner>}

      <Select
        label="What is it"
        value={form.kind}
        onChange={(e) => set('kind', e.target.value as OpportunityKind)}
        options={OPPORTUNITY_KINDS.filter(
          (value) => value !== 'alumni_referral' || canPostReferral
        ).map((value) => ({ value, label: OPPORTUNITY_KIND_META[value].label }))}
        hint={meta.blurb}
      />

      <Input
        label="Title"
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        error={fieldErrors.title}
        placeholder={
          form.kind === 'club_role'
            ? 'Consulting Club — Research Associate'
            : form.kind === 'teaching_assistant'
              ? 'TA for Marketing Management'
              : 'Looking for two people'
        }
        maxLength={120}
        autoFocus
      />

      {meta.hasOrg && (
        <Input
          label={form.kind === 'alumni_referral' ? 'Your company' : 'Client or company'}
          value={form.org}
          onChange={(e) => set('org', e.target.value)}
          error={fieldErrors.org}
          placeholder="Acme Corp"
          maxLength={80}
        />
      )}

      <Select
        label="Time commitment"
        value={form.commitment}
        onChange={(e) => set('commitment', e.target.value as CommitmentLevel)}
        options={COMMITMENT_LEVELS.map((value) => ({
          value,
          label: COMMITMENT_META[value].label,
        }))}
        hint="Say it honestly. Nothing burns goodwill faster than a 'few hours' that is not."
      />

      <Textarea
        label="What you need"
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
        error={fieldErrors.description}
        placeholder="What the work actually is, who it suits, and how to apply."
        rows={5}
        maxLength={2000}
        showCount
      />

      <Input
        label="Link"
        type="url"
        value={form.link}
        onChange={(e) => set('link', e.target.value)}
        error={fieldErrors.link}
        placeholder="https://forms.gle/…"
        optional
        hint="A form or a page with more detail, if there is one."
      />

      <Switch
        label="Happy to be messaged about this"
        hint="This is what lets people reach you directly. Messaging is otherwise limited to people you have completed a session with."
        checked={form.invitesContact}
        onChange={(checked) => set('invitesContact', checked)}
      />
    </Dialog>
  );
}
