'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Link2Off } from 'lucide-react';
import Button from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { getInitials } from '@/lib/utils';
import hub from '@/components/hub/hub.module.css';
import styles from '../../../app.module.css';

interface InviteServer {
  _id: string;
  name: string;
  description: string;
  memberCount: number;
  color: string;
}

export default function HubInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const toast = useToast();
  const [joining, setJoining] = useState(false);
  const { data, error } = useApiQuery<{ server: InviteServer }>(`/api/hub/invites/${encodeURIComponent(code)}`);

  if (error) {
    return <EmptyState art={<Link2Off size={36} strokeWidth={1.4} />} title="This invite does not work" body={error} />;
  }
  if (!data) return <div className="skeleton" style={{ height: 220, maxWidth: 420, margin: '40px auto' }} />;

  const join = async () => {
    setJoining(true);
    try {
      const { serverId } = await api.post<{ serverId: string }>(`/api/hub/invites/${encodeURIComponent(code)}`);
      router.replace(`/hub/${serverId}`);
    } catch (caught) {
      toast.error('Could not join', errorMessage(caught));
      setJoining(false);
    }
  };

  const { server } = data;
  return (
    <div className={hub.serverCard} style={{ maxWidth: 420, margin: '40px auto', alignItems: 'center', textAlign: 'center', padding: 'var(--s-6)' }}>
      <span className={hub.railItem} style={{ background: server.color, width: 64, height: 64, fontSize: 22 }} aria-hidden>{getInitials(server.name)}</span>
      <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>You have been invited to</span>
      <h1 className={styles.pageTitle}>{server.name}</h1>
      {server.description && <p className="muted">{server.description}</p>}
      <span className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><Users size={14} /> {server.memberCount} members</span>
      <Button size="lg" onClick={join} loading={joining}>Accept invite</Button>
    </div>
  );
}
