'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { CAMPUS_UNLOCK_MEMBERS, CAMPUS_UNLOCK_MENTORS, type CampusStatus } from '@mba/shared/campus';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { Input, Switch, Textarea } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { formatDate } from '@/lib/utils';
import styles from './admin.module.css';

interface CampusRow {
  _id: string;
  name: string;
  shortName: string;
  domains: string[];
  city: string;
  status: CampusStatus;
  requestNote: string;
  createdAt: string;
  unlockedAt: string | null;
  settings: { crossCampusMentors: boolean; crossCampusFeed: boolean; whispers: boolean; games: boolean; discordGuildId: string };
  density: { members: number; mentors: number; overall: number; ready: boolean };
}

const STATUS_META: Record<CampusStatus, { label: string; tone: 'amber' | 'blue' | 'teal' | 'rose' }> = {
  requested: { label: 'Requested', tone: 'amber' },
  open: { label: 'Open Edition', tone: 'blue' },
  campus: { label: 'Campus Edition', tone: 'teal' },
  suspended: { label: 'Suspended', tone: 'rose' },
};

type Filter = 'all' | CampusStatus;

/** Requests first; every campus with its progress toward the Campus Edition. */
export default function CampusesPanel() {
  const { data, loading, refetch } = useApiQuery<{ campuses: CampusRow[] }>('/api/admin/campuses');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<CampusRow | null>(null);

  const campuses = data?.campuses ?? [];
  const counts = campuses.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
  const needle = q.trim().toLowerCase();
  const rows = campuses
    .filter((c) => filter === 'all' || c.status === filter)
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.domains.some((d) => d.includes(needle)))
    // Requests waiting on us come first, then the campuses closest to unlocking.
    .sort((a, b) => Number(b.status === 'requested') - Number(a.status === 'requested') || b.density.overall - a.density.overall || a.name.localeCompare(b.name));

  return (
    <div className="stack gap-4">
      <div className={styles.filters}>
        <Segmented
          ariaLabel="Campus status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: campuses.length },
            { value: 'requested', label: 'Requests', count: counts.requested },
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'campus', label: 'Campus', count: counts.campus },
            { value: 'suspended', label: 'Suspended', count: counts.suspended },
          ]}
        />
        <div className="grow" style={{ minWidth: 200 }}>
          <Input icon={<Search size={15} />} placeholder="Name or domain" aria-label="Search campuses" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading && !data ? (
        <div className="skeleton" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
      ) : rows.length === 0 ? (
        <EmptyState title="No campuses here" body="Requests appear when someone signs up from an institute domain we do not know yet." />
      ) : (
        <div className={styles.list}>
          {rows.map((c) => (
            <button key={c._id} type="button" className={styles.campusRow} onClick={() => setEditing(c)}>
              <div className={styles.personMain}>
                <div className="row gap-2 wrap">
                  <strong>{c.name}</strong>
                  <Chip tone={STATUS_META[c.status].tone}>{STATUS_META[c.status].label}</Chip>
                </div>
                <span className={styles.personMeta}>
                  {c.domains.join(', ')}
                  {c.status === 'requested' && c.requestNote ? ` · “${c.requestNote}”` : ''}
                </span>
              </div>
              <div className={styles.density} title={`${c.density.members}/${CAMPUS_UNLOCK_MEMBERS} members · ${c.density.mentors}/${CAMPUS_UNLOCK_MENTORS} mentors`}>
                <span className={styles.densityText}>
                  {c.density.members} members · {c.density.mentors} mentors
                </span>
                {c.status === 'open' && (
                  <div className={styles.meter} aria-label="Progress to the Campus Edition">
                    <span className={styles.meterFill} style={{ width: `${Math.round(c.density.overall * 100)}%` }} />
                  </div>
                )}
                {c.status === 'campus' && c.unlockedAt && <span className={styles.densityText}>Unlocked {formatDate(c.unlockedAt)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && <CampusDialog campus={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />}
    </div>
  );
}

function CampusDialog({ campus, onClose, onSaved }: { campus: CampusRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<CampusStatus>(campus.status);
  const [domains, setDomains] = useState(campus.domains.join(', '));
  const [shortName, setShortName] = useState(campus.shortName);
  const [city, setCity] = useState(campus.city);
  const [settings, setSettings] = useState(campus.settings);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const statusChanged = status !== campus.status;
  const needsReason = statusChanged && status === 'suspended';

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/admin/campuses/${campus._id}`, {
        status,
        domains: domains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean),
        shortName,
        city,
        settings,
        reason,
      });
      toast.success(statusChanged ? `${campus.name}: ${STATUS_META[status].label}` : 'Saved');
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={campus.name}
      description={`${campus.density.members} verified members, ${campus.density.mentors} mentors. Unlocks by itself at ${CAMPUS_UNLOCK_MEMBERS} and ${CAMPUS_UNLOCK_MENTORS}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={status === 'suspended' && statusChanged ? 'danger' : 'primary'} loading={saving} disabled={needsReason && reason.trim().length < 5} onClick={save}>
            {statusChanged ? (status === 'campus' ? 'Unlock now' : status === 'open' ? (campus.status === 'requested' ? 'Approve' : 'Save') : status === 'suspended' ? 'Suspend' : 'Save') : 'Save'}
          </Button>
        </>
      }
    >
      <div className="stack gap-4">
        <Segmented
          ariaLabel="Status"
          value={status}
          onChange={setStatus}
          options={(['requested', 'open', 'campus', 'suspended'] as const).map((s) => ({ value: s, label: STATUS_META[s].label }))}
        />
        {statusChanged && status === 'campus' && (
          <p className={styles.note}>Every member is told the Campus Edition is live. Unlock early only for a founding partner school with seniors ready to host.</p>
        )}
        {statusChanged && status === 'suspended' && <p className={styles.note}>Members can still sign in to export their data; everything else stops.</p>}
        <Input label="Email domains" hint="Comma-separated. Subdomains are included." value={domains} onChange={(e) => setDomains(e.target.value)} />
        <div className={styles.grid2}>
          <Input label="Short name" value={shortName} maxLength={30} onChange={(e) => setShortName(e.target.value)} />
          <Input label="City" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="stack gap-3">
          <Switch checked={settings.crossCampusMentors} onChange={(v) => setSettings({ ...settings, crossCampusMentors: v })} label="Cross-campus mentoring" hint="Students can book mentors from other campuses, and this campus’s mentors can opt in to help them." />
          <Switch checked={settings.whispers} onChange={(v) => setSettings({ ...settings, whispers: v })} label="Course & professor reviews" />
          <Switch checked={settings.games} onChange={(v) => setSettings({ ...settings, games: v })} label="Games" />
        </div>
        {(statusChanged || needsReason) && (
          <Textarea label="Reason" optional={!needsReason} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} hint="Kept in the audit log." />
        )}
      </div>
    </Dialog>
  );
}
