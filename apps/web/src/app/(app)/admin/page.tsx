'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { EmptyState, Segmented } from '@/components/ui/Display';
import { Select } from '@/components/ui/Field';
import MetricCards from '@/components/admin/MetricCards';
import CampusesPanel from '@/components/admin/CampusesPanel';
import PeoplePanel from '@/components/admin/PeoplePanel';
import ReleasesPanel from '@/components/admin/ReleasesPanel';
import AuditList from '@/components/admin/AuditList';
import type { SuccessMetrics } from '@/components/admin/types';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import styles from '../app.module.css';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'campuses', label: 'Campuses' },
  { value: 'people', label: 'People' },
  { value: 'games', label: 'Games' },
  { value: 'audit', label: 'Audit log' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function PlatformAdminPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}>
      <PlatformAdmin />
    </Suspense>
  );
}

function PlatformAdmin() {
  const { me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'overview';

  if (me && !me.isPlatformAdmin) {
    return <EmptyState art={<ShieldAlert size={22} />} title="Platform admins only" body="This console runs the whole platform. Campus admins have their own under Institute." />;
  }

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Platform admin</h2>
          <p className={styles.pageSubtitle}>Campuses, people, game releases, and whether any of this is working.</p>
        </div>
      </div>
      <Segmented ariaLabel="Admin section" value={tab} onChange={(next) => router.replace(`/admin?tab=${next}`, { scroll: false })} options={TABS} />
      {tab === 'overview' && <Overview />}
      {tab === 'campuses' && <CampusesPanel />}
      {tab === 'people' && <PeoplePanel scope="platform" />}
      {tab === 'games' && <ReleasesPanel />}
      {tab === 'audit' && <AuditList source="/api/admin/audit" />}
    </div>
  );
}

function Overview() {
  const [campus, setCampus] = useState('');
  const [days, setDays] = useState('120');
  const { data: campuses } = useApiQuery<{ campuses: Array<{ name: string; status: string }> }>('/api/admin/campuses');
  const { data, error } = useApiQuery<{ metrics: SuccessMetrics; campuses: Record<string, number> }>('/api/admin/overview', { campus: campus || undefined, window: days });
  return (
    <div className="stack gap-4">
      <div className="row gap-3 wrap">
        <Select
          aria-label="Campus"
          value={campus}
          onChange={(e) => setCampus(e.target.value)}
          options={[{ value: '', label: 'Every campus' }, ...(campuses?.campuses ?? []).filter((c) => c.status !== 'requested').map((c) => ({ value: c.name, label: c.name }))]}
        />
        <Select
          aria-label="Window"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          options={[
            { value: '30', label: 'Last 30 days' },
            { value: '120', label: 'This term (120 days)' },
            { value: '365', label: 'Last year' },
          ]}
        />
        {data && (
          <span className={styles.pageSubtitle}>
            {data.campuses.campus ?? 0} on the Campus Edition · {data.campuses.open ?? 0} open · {data.campuses.requested ?? 0} waiting for approval
          </span>
        )}
      </div>
      {error && <div className={styles.errorBox}>{error}</div>}
      {data ? <MetricCards metrics={data.metrics} /> : !error && <div className="skeleton" style={{ height: 320, borderRadius: 'var(--r-lg)' }} />}
    </div>
  );
}
