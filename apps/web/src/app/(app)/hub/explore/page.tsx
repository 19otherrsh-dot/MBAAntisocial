'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Compass, Search, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { getInitials } from '@/lib/utils';
import type { HubServerSummary } from '@/components/hub/types';
import hub from '@/components/hub/hub.module.css';
import styles from '../../app.module.css';

type Kind = 'all' | 'club' | 'circle' | 'course' | 'team';
type ExploreServer = HubServerSummary & { joined: boolean; requested: boolean };

const KIND_LABEL: Record<string, string> = { club: 'Club', circle: 'Circle', course: 'Course', team: 'Team', custom: 'Server' };

export default function HubExplorePage() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, refetch } = useApiQuery<{ servers: ExploreServer[] }>('/api/hub/servers/explore', { q: q.trim() || undefined, kind: kind === 'all' ? undefined : kind });

  const act = async (server: ExploreServer) => {
    if (server.joined) return router.push(`/hub/${server._id}`);
    setBusy(server._id);
    try {
      if (server.visibility === 'public') {
        await api.post(`/api/hub/servers/${server._id}/membership`, { action: 'join' });
        router.push(`/hub/${server._id}`);
      } else {
        await api.post(`/api/hub/servers/${server._id}/membership`, { action: 'request' });
        toast.success('Request sent', 'You will get a notification when someone lets you in.');
        refetch();
      }
    } catch (caught) {
      toast.error('Could not join', errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <Link href="/hub" className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> Back to the hub</Link>
          <h1 className={styles.pageTitle}>Explore servers</h1>
          <p className={styles.pageSubtitle}>Clubs, interest circles, course sections, and teams on your campus.</p>
        </div>
      </div>

      <div className="row gap-3 wrap">
        <div style={{ flex: '1 1 240px' }}>
          <Input aria-label="Search servers" placeholder="Search by name" icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented
          ariaLabel="Server kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All' },
            { value: 'club', label: 'Clubs' },
            { value: 'circle', label: 'Circles' },
            { value: 'course', label: 'Courses' },
            { value: 'team', label: 'Teams' },
          ]}
        />
      </div>

      {!data ? (
        <div className={hub.exploreGrid}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>
      ) : data.servers.length === 0 ? (
        <EmptyState art={<Compass size={36} strokeWidth={1.4} />} title="Nothing matches yet" body="Start one: the plus button on the hub's server rail creates a circle in a few seconds." />
      ) : (
        <div className={hub.exploreGrid}>
          {data.servers.map((s) => (
            <div key={s._id} className={hub.serverCard}>
              <div className={hub.serverCardHead}>
                <span className={hub.railItem} style={{ background: s.color, flex: 'none' }} aria-hidden>{getInitials(s.name)}</span>
                <div style={{ minWidth: 0 }}>
                  <strong className="truncate" style={{ display: 'block' }}>{s.name}</strong>
                  <span className="row gap-2 dim" style={{ fontSize: 'var(--t-xs)' }}>
                    <Chip>{KIND_LABEL[s.kind] ?? 'Server'}</Chip>
                    <Users size={12} /> {s.memberCount}
                  </span>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 'var(--t-sm)', flex: 1 }}>{s.description || 'No description yet.'}</p>
              <Button
                size="sm"
                variant={s.joined ? 'secondary' : 'primary'}
                disabled={s.requested}
                loading={busy === s._id}
                onClick={() => act(s)}
              >
                {s.joined ? 'Open' : s.requested ? 'Requested' : s.visibility === 'public' ? 'Join' : 'Ask to join'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
