'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Archive, Download, Pencil, Plus, Search, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction, useDebounced } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import { COMP_CATEGORIES, ROLE_META, USER_ROLES, type CompCategory, type UserRole } from '@/lib/constants';
import { cn, formatDate, formatDateTime, timeAgo, toDateTimeLocalValue } from '@/lib/utils';
import styles from '../app.module.css';

type Tab = 'people' | 'comps' | 'audit';

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
      <Admin />
    </Suspense>
  );
}

function Admin() {
  const { me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = requested === 'comps' || requested === 'audit' ? requested : 'people';

  if (me && me.role !== 'admin') {
    return (
      <EmptyState
        art={<ShieldAlert size={40} strokeWidth={1.4} />}
        title="Admins only"
        body="This console is for your institute's administrators."
      />
    );
  }

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Admin</h2>
          <p className={styles.pageSubtitle}>
            {me?.campus} · people, roles, the competition calendar, and the audit trail.
          </p>
        </div>
      </div>

      <Segmented
        ariaLabel="Admin section"
        value={tab}
        onChange={(next) => router.replace(`/admin?tab=${next}`, { scroll: false })}
        options={[
          { value: 'people' as const, label: 'People' },
          { value: 'comps' as const, label: 'Competitions' },
          { value: 'audit' as const, label: 'Audit log' },
        ]}
      />

      {tab === 'people' && <People />}
      {tab === 'comps' && <Competitions />}
      {tab === 'audit' && <AuditTrail />}
    </>
  );
}

/* ───────────────────────── People ───────────────────────── */

interface Person {
  _id: string;
  name: string;
  email: string;
  image: string;
  role: UserRole;
  year: 1 | 2;
  batch: string;
  suspended: boolean;
  suspensionReason: string;
  joinedAt: string;
  lastActiveAt: string | null;
  sso: string[];
  isYou: boolean;
}

type PersonAction = { person: Person; kind: 'role' | 'suspend' | 'restore' };

function People() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [page, setPage] = useState(1);
  const [acting, setActing] = useState<PersonAction | null>(null);
  const debounced = useDebounced(search, 250);

  const query = useMemo(
    () => ({ search: debounced || undefined, role: role || undefined, status, page }),
    [debounced, role, status, page]
  );
  const { data, loading, error, refetch } = useApiQuery<{
    users: Person[];
    roleCounts: Record<string, number>;
    pagination: { page: number; hasMore: boolean; total: number };
  }>('/api/admin/users', query);

  return (
    <>
      <div className={styles.toolbar}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input
            aria-label="Search people"
            placeholder="Search by name or email"
            icon={<Search size={15} />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          aria-label="Filter by role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as UserRole | '');
            setPage(1);
          }}
          options={[
            { value: '', label: 'All roles' },
            ...USER_ROLES.map((value) => ({
              value,
              label: `${ROLE_META[value].label}${data?.roleCounts[value] ? ` (${data.roleCounts[value]})` : ''}`,
            })),
          ]}
        />
        <Segmented
          ariaLabel="Account status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: 'all' as const, label: 'All' },
            { value: 'active' as const, label: 'Active' },
            { value: 'suspended' as const, label: 'Suspended' },
          ]}
        />
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      {loading ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : !data || data.users.length === 0 ? (
        <EmptyState art={<Search size={36} strokeWidth={1.4} />} title="Nobody matches" body="Try a different name, role, or status." />
      ) : (
        <div className={styles.board}>
          {data.users.map((person) => (
            <div key={person._id} className={styles.boardRow} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <div className={styles.boardPerson}>
                <Avatar name={person.name} image={person.image} seed={person._id} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div className={styles.boardName}>
                    {person.name}
                    {person.isYou && <span className="dim"> · you</span>}
                  </div>
                  <div className={cn(styles.boardSub, 'row', 'gap-2', 'wrap')}>
                    <span className="truncate">{person.email}</span>
                    <Chip tone={person.role === 'admin' ? 'rose' : person.role === 'moderator' ? 'violet' : 'slate'}>
                      {ROLE_META[person.role].label}
                    </Chip>
                    {person.suspended && <Chip tone="rose">Suspended</Chip>}
                    {person.sso.length > 0 && <Chip outline>SSO</Chip>}
                    <span>{person.lastActiveAt ? `active ${timeAgo(person.lastActiveAt)}` : `joined ${formatDate(person.joinedAt)}`}</span>
                  </div>
                </div>
              </div>
              {!person.isYou && (
                <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Role for ${person.name}`}
                    onClick={() => setActing({ person, kind: 'role' })}
                  >
                    Role
                  </Button>
                  {person.suspended ? (
                    <Button size="sm" variant="soft" icon={<UserCheck size={14} />} aria-label={`Restore ${person.name}`} onClick={() => setActing({ person, kind: 'restore' })}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="dangerGhost" icon={<UserX size={14} />} aria-label={`Suspend ${person.name}`} onClick={() => setActing({ person, kind: 'suspend' })}>
                      Suspend
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {data && (data.pagination.page > 1 || data.pagination.hasMore) && (
        <div className="row gap-2" style={{ justifyContent: 'center' }}>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="dim tnum" style={{ fontSize: 'var(--t-sm)' }}>
            Page {page} · {data.pagination.total} people
          </span>
          <Button size="sm" variant="ghost" disabled={!data.pagination.hasMore} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {acting && (
        <PersonDialog
          action={acting}
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null);
            refetch();
          }}
        />
      )}
    </>
  );
}

function PersonDialog({ action, onClose, onDone }: { action: PersonAction; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { person, kind } = action;
  const [role, setRole] = useState<UserRole>(person.role);
  const [reason, setReason] = useState('');

  const submit = useAction(async () => {
    await api.patch('/api/admin/users', {
      userId: person._id,
      action: kind === 'role' ? 'set_role' : kind,
      ...(kind === 'role' ? { role } : {}),
      reason: reason.trim(),
    });
    toast.success(kind === 'role' ? 'Role updated' : kind === 'suspend' ? 'Account suspended' : 'Account restored', 'Recorded in the audit log.');
    onDone();
  });

  const copy = {
    role: { title: `Change ${person.name}'s role`, confirm: 'Save role', danger: false },
    suspend: { title: `Suspend ${person.name}?`, confirm: 'Suspend', danger: true },
    restore: { title: `Restore ${person.name}?`, confirm: 'Restore', danger: false },
  }[kind];

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      description={
        kind === 'suspend'
          ? 'They are signed out at once and cannot sign back in. Their content stays.'
          : kind === 'restore'
            ? `They can sign in again.${person.suspensionReason ? ` Suspended for: “${person.suspensionReason}”.` : ''}`
            : 'Takes effect on their next click. Every change is kept in the audit log.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            variant={copy.danger ? 'danger' : 'primary'}
            onClick={() => submit.run()}
            loading={submit.pending}
            disabled={(kind === 'suspend' && !reason.trim()) || (kind === 'role' && role === person.role)}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      {submit.error && <Banner variant="danger">{submit.error}</Banner>}
      {kind === 'role' && (
        <Select
          label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as UserRole)}
          hint={ROLE_META[role].blurb}
          options={USER_ROLES.map((value) => ({ value, label: ROLE_META[value].label }))}
        />
      )}
      <Textarea
        label={kind === 'suspend' ? 'Reason' : 'Note for the record'}
        placeholder="Why. Future admins will read it."
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        rows={3}
        optional={kind !== 'suspend'}
      />
    </Dialog>
  );
}

/* ───────────────────────── Competitions ───────────────────────── */

interface Comp {
  _id: string;
  title: string;
  host: string;
  description: string;
  category: CompCategory;
  registrationDeadline: string;
  eventDate?: string | null;
  prizePool: string;
  teamSize: string;
  eligibility: string;
  url: string;
  archivedAt?: string | null;
  saves: number;
}

function Competitions() {
  const { data, loading, error, refetch } = useApiQuery<{ comps: Comp[] }>('/api/admin/comps');
  const [editing, setEditing] = useState<Comp | 'new' | null>(null);
  const toast = useToast();

  const archive = async (comp: Comp) => {
    try {
      await api.patch('/api/admin/comps', { action: 'archive', compId: comp._id });
      toast.success('Archived', 'It no longer shows on the calendar.');
      refetch();
    } catch (caught) {
      toast.error('Could not archive', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <>
      <div className="row between">
        <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
          Competitions you add here appear on your campus calendar, and saving one puts its deadline in a student&apos;s task list.
        </p>
        <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
          Add competition
        </Button>
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      {loading ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : !data || data.comps.length === 0 ? (
        <EmptyState
          art={<Plus size={36} strokeWidth={1.4} />}
          title="No campus competitions yet"
          body="Add the case competitions your students should know about."
          action={<Button onClick={() => setEditing('new')}>Add competition</Button>}
        />
      ) : (
        <div className={styles.cardList}>
          {data.comps.map((comp) => (
            <article key={comp._id} className={styles.slotCard} style={comp.archivedAt ? { opacity: 0.55 } : undefined}>
              <div className={styles.slotMain}>
                <div className={styles.slotTop}>
                  <Chip tone="violet">{comp.category}</Chip>
                  <Chip outline>Closes {formatDate(comp.registrationDeadline)}</Chip>
                  <Chip outline>{comp.saves} saved</Chip>
                  {comp.archivedAt && <Chip tone="slate">Archived</Chip>}
                </div>
                <div className={styles.slotName}>{comp.title}</div>
                <div className={styles.slotRole}>{comp.host}</div>
                {!comp.archivedAt && (
                  <div className={styles.slotActions}>
                    <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditing(comp)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Archive size={14} />} onClick={() => archive(comp)}>
                      Archive
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <CompDialog
          comp={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </>
  );
}

function CompDialog({ comp, onClose, onDone }: { comp: Comp | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: comp?.title ?? '',
    host: comp?.host ?? '',
    description: comp?.description ?? '',
    category: (comp?.category ?? 'general') as CompCategory,
    registrationDeadline: comp ? toDateTimeLocalValue(new Date(comp.registrationDeadline)) : '',
    eventDate: comp?.eventDate ? toDateTimeLocalValue(new Date(comp.eventDate)) : '',
    prizePool: comp?.prizePool ?? '',
    teamSize: comp?.teamSize ?? '',
    eligibility: comp?.eligibility ?? '',
    url: comp?.url ?? '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = useAction(async () => {
    const payload = {
      ...form,
      registrationDeadline: new Date(form.registrationDeadline).toISOString(),
      eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : null,
    };
    if (comp) await api.patch('/api/admin/comps', { action: 'update', compId: comp._id, comp: payload });
    else await api.post('/api/admin/comps', payload);
    toast.success(comp ? 'Saved' : 'Added to the calendar');
    onDone();
  });

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={comp ? 'Edit competition' : 'Add a competition'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          <Button
            onClick={() => save.run()}
            loading={save.pending}
            disabled={!form.title.trim() || !form.host.trim() || !form.registrationDeadline || !form.url.trim()}
          >
            {comp ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      {save.error && <Banner variant="danger">{save.error}</Banner>}
      <div className={styles.checkGrid}>
        <Input label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} autoFocus />
        <Input label="Host" placeholder="e.g. HUL, Bain" value={form.host} onChange={(e) => set('host', e.target.value)} maxLength={120} />
      </div>
      <div className={styles.checkGrid}>
        <Select
          label="Category"
          value={form.category}
          onChange={(e) => set('category', e.target.value as CompCategory)}
          options={COMP_CATEGORIES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
        />
        <Input label="Link" type="url" placeholder="https://" value={form.url} onChange={(e) => set('url', e.target.value)} />
      </div>
      <div className={styles.checkGrid}>
        <Input label="Registration closes" type="datetime-local" value={form.registrationDeadline} onChange={(e) => set('registrationDeadline', e.target.value)} />
        <Input label="Event date" type="datetime-local" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} optional />
      </div>
      <div className={styles.checkGrid}>
        <Input label="Prize pool" placeholder="₹2,00,000" value={form.prizePool} onChange={(e) => set('prizePool', e.target.value)} optional />
        <Input label="Team size" placeholder="2–4" value={form.teamSize} onChange={(e) => set('teamSize', e.target.value)} optional />
      </div>
      <Input label="Eligibility" value={form.eligibility} onChange={(e) => set('eligibility', e.target.value)} optional />
      <Textarea label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={2000} optional />
    </Dialog>
  );
}

/* ───────────────────────── Audit log ───────────────────────── */

const ACTION_LABEL: Record<string, string> = {
  'account.provisioned_sso': 'Joined via single sign-on',
  'account.password_reset': 'Reset their password',
  'account.deleted': 'Deleted their account',
  'role.changed': 'Changed a role',
  'user.suspended': 'Suspended an account',
  'user.restored': 'Restored an account',
  'report.resolved': 'Resolved a report',
  'content.hidden': 'Hid content',
  'comp.created': 'Added a competition',
  'comp.updated': 'Edited a competition',
  'comp.archived': 'Archived a competition',
};

interface AuditEntry {
  _id: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetLabel: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

function describeDetail(entry: AuditEntry): string {
  const d = entry.detail ?? {};
  if (entry.action === 'role.changed') {
    const from = ROLE_META[d.from as UserRole]?.label ?? d.from;
    const to = ROLE_META[d.to as UserRole]?.label ?? d.to;
    return `${from} → ${to}${d.reason ? ` · “${d.reason}”` : ''}`;
  }
  if (typeof d.reason === 'string' && d.reason) return `“${d.reason}”`;
  if (typeof d.resolution === 'string') return d.resolution.replace('_', ' ');
  if (Array.isArray(d.fields) && d.fields.length) return `changed ${d.fields.join(', ')}`;
  if (typeof d.provider === 'string') return d.provider;
  return '';
}

function AuditTrail() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const query = useMemo(() => ({ action: action || undefined, page }), [action, page]);
  const { data, loading, error } = useApiQuery<{
    entries: AuditEntry[];
    pagination: { page: number; hasMore: boolean; total: number };
  }>('/api/admin/audit', query);

  const csvHref = `/api/admin/audit?format=csv${action ? `&action=${action}` : ''}`;

  return (
    <>
      <div className={styles.toolbar}>
        <Select
          aria-label="Filter by action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          options={[{ value: '', label: 'All actions' }, ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))]}
        />
        <div className={styles.toolbarPush}>
          <a href={csvHref} download>
            <Button variant="secondary" icon={<Download size={16} />}>
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
        Every privileged action on your campus, newest first. Entries cannot be edited or deleted.
      </p>

      {error && <Banner variant="danger">{error}</Banner>}

      {loading ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState art={<ShieldAlert size={36} strokeWidth={1.4} />} title="Nothing recorded yet" body="Role changes, suspensions, and moderation decisions appear here." />
      ) : (
        <div className={styles.board}>
          {data.entries.map((entry) => (
            <div key={entry._id} className={styles.boardRow} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.boardName}>
                  {entry.actorName || 'Someone'} · {ACTION_LABEL[entry.action] ?? entry.action}
                  {entry.targetLabel && <span className="dim"> — {entry.targetLabel}</span>}
                </div>
                <div className={styles.boardSub}>
                  {ROLE_META[entry.actorRole as UserRole]?.label ?? entry.actorRole}
                  {describeDetail(entry) && ` · ${describeDetail(entry)}`}
                </div>
              </div>
              <span className="dim tnum" style={{ fontSize: 'var(--t-xs)', whiteSpace: 'nowrap' }} title={formatDateTime(entry.createdAt)}>
                {timeAgo(entry.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {data && (data.pagination.page > 1 || data.pagination.hasMore) && (
        <div className="row gap-2" style={{ justifyContent: 'center' }}>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="dim tnum" style={{ fontSize: 'var(--t-sm)' }}>
            Page {page} · {data.pagination.total} entries
          </span>
          <Button size="sm" variant="ghost" disabled={!data.pagination.hasMore} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}
