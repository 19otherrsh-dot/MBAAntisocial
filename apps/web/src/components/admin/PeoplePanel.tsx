'use client';

import { useState } from 'react';
import { Ban, RotateCcw, Search } from 'lucide-react';
import { ROLE_META, USER_ROLES, type UserRole } from '@mba/shared/constants';
import { Avatar, Chip, EmptyState } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api, errorMessage } from '@/lib/client/api';
import type { Person } from './types';
import styles from './admin.module.css';

const CAMPUS_ROLES: readonly UserRole[] = ['student', 'mentor', 'alumni', 'moderator', 'placement_office'];

/**
 * Find people and change their role or suspend them. The same panel serves
 * the platform console (every campus, every role) and a campus admin (their
 * campus, roles up to moderator) — the server enforces the difference.
 */
export default function PeoplePanel({ scope }: { scope: 'platform' | 'campus' }) {
  const { me } = useMe();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const query = useDebounced(q, 300);
  const base = scope === 'platform' ? '/api/admin/people' : '/api/institute/people';
  const { data, loading, refetch } = useApiQuery<{ people: Person[] }>(base, { q: query, role: role || undefined });
  const [suspending, setSuspending] = useState<Person | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const assignable = scope === 'platform' ? USER_ROLES : CAMPUS_ROLES;

  const patch = async (person: Person, body: { role?: UserRole; suspended?: boolean; reason?: string }, done: string) => {
    setBusy(person._id);
    try {
      await api.patch(`${base}/${person._id}`, body);
      toast.success(done);
      refetch();
      return true;
    } catch (caught) {
      toast.error('That did not go through', errorMessage(caught));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack gap-4">
      <div className={styles.filters}>
        <div className="grow" style={{ minWidth: 220 }}>
          <Input icon={<Search size={15} />} placeholder="Name or email" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole | '')}
          options={[{ value: '', label: 'All roles' }, ...USER_ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))]}
        />
      </div>

      {loading && !data ? (
        <div className="skeleton" style={{ height: 240, borderRadius: 'var(--r-lg)' }} />
      ) : !data?.people.length ? (
        <EmptyState title="Nobody matches" body="Try part of a name or an email address." />
      ) : (
        <div className={styles.list}>
          {data.people.map((person) => {
            const self = person._id === me?.id;
            const locked = self || (scope === 'campus' && !CAMPUS_ROLES.includes(person.role));
            return (
              <div key={person._id} className={styles.personRow}>
                <Avatar name={person.name} image={person.image ?? undefined} seed={person._id} size={34} />
                <div className={styles.personMain}>
                  <div className="row gap-2 wrap">
                    <strong className="truncate">{person.name}</strong>
                    {person.suspended && <Chip tone="rose">Suspended</Chip>}
                    {!person.verified && <Chip tone="slate" outline>Unverified</Chip>}
                    {self && <Chip tone="violet" outline>You</Chip>}
                  </div>
                  <span className={styles.personMeta}>
                    {person.email}
                    {scope === 'platform' ? ` · ${person.campus}` : ''} · {person.batch || `Year ${person.year}`}
                  </span>
                </div>
                <div className={styles.personActions}>
                  <Select
                    aria-label={`Role for ${person.name}`}
                    value={person.role}
                    disabled={locked || busy === person._id}
                    onChange={(e) => void patch(person, { role: e.target.value as UserRole }, `${person.name} is now ${ROLE_META[e.target.value as UserRole].label.toLowerCase()}`)}
                    options={(locked ? [person.role] : assignable).map((r) => ({ value: r, label: ROLE_META[r].label }))}
                  />
                  {person.suspended ? (
                    <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} disabled={locked} loading={busy === person._id} onClick={() => void patch(person, { suspended: false }, `${person.name} is reinstated`)}>
                      Reinstate
                    </Button>
                  ) : (
                    <Button size="sm" variant="dangerGhost" icon={<Ban size={14} />} disabled={locked} onClick={() => { setReason(''); setSuspending(person); }}>
                      Suspend
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {suspending && (
        <Dialog
          open
          onClose={() => setSuspending(null)}
          title={`Suspend ${suspending.name}?`}
          description="They lose access on their very next request and cannot sign back in. Nothing they posted is deleted."
          footer={
            <>
              <Button variant="ghost" onClick={() => setSuspending(null)}>Never mind</Button>
              <Button
                variant="danger"
                disabled={reason.trim().length < 5}
                loading={busy === suspending._id}
                onClick={async () => {
                  if (await patch(suspending, { suspended: true, reason }, `${suspending.name} is suspended`)) setSuspending(null);
                }}
              >
                Suspend
              </Button>
            </>
          }
        >
          <Textarea label="Reason" hint="Kept in the audit log. Be specific — a report id, a date." rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Dialog>
      )}
    </div>
  );
}
