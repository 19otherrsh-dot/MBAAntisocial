'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { ArrowLeft, Video } from 'lucide-react';
import Button from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import styles from '../../app.module.css';

interface TokenResponse {
  token: string;
  url: string;
  title: string;
  backHref: string;
}

/**
 * Built-in video room for mock sessions, GDs, and hub voice channels. Nothing
 * starts until the person clicks Join, so the camera never switches on by surprise.
 */
export default function MeetPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = use(params);
  const router = useRouter();
  const [joined, setJoined] = useState(false);
  const { data, error, loading } = useApiQuery<TokenResponse>(joined ? '/api/meet/token' : null, { room });

  if (!joined) {
    return (
      <div className={styles.meetLobby}>
        <Video size={36} />
        <h1 className={styles.pageTitle}>Ready to join?</h1>
        <p className={styles.pageSubtitle}>Your camera and mic stay off until you turn them on inside the room.</p>
        <div className="row gap-3">
          <Button size="lg" onClick={() => setJoined(true)}>Join room</Button>
          <Button size="lg" variant="ghost" onClick={() => router.back()}>Not now</Button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="skeleton" style={{ height: '70vh' }} />;
  if (error || !data) {
    return (
      <EmptyState
        art={<Video size={36} />}
        title="Can’t open this room"
        body={error ?? 'The room may have ended, or it is not one of yours.'}
        action={<Link href="/home"><Button variant="secondary">Back to Today</Button></Link>}
      />
    );
  }

  return (
    <div className={styles.meetFrame} data-lk-theme="default">
      <div className={styles.meetBar}>
        <Link href={data.backHref} className="row gap-2"><ArrowLeft size={16} /> Leave</Link>
        <span className="truncate">{data.title}</span>
      </div>
      <LiveKitRoom
        serverUrl={data.url}
        token={data.token}
        connect
        video={false}
        audio={false}
        onDisconnected={() => router.push(data.backHref)}
        style={{ height: 'calc(100% - 44px)' }}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
