'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { pusherClient } from '@/lib/pusherClient';
import { cn, timeAgo } from '@/lib/utils';
import styles from './shell.module.css';

interface NotificationRow {
  _id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  readAt?: string;
  createdAt: string;
}

export default function NotificationBell() {
  const router = useRouter();
  const { unread, setUnread, me } = useMe();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Passing `null` while closed means the panel's contents are only fetched
  // when it is actually opened.
  const { data, loading, mutate } = useApiQuery<{
    notifications: NotificationRow[];
    unread: number;
  }>(open ? '/api/notifications' : null, { limit: 20 });

  const rows = data?.notifications ?? [];

  // Close on an outside click or Escape — the panel is not a modal, so it
  // should get out of the way as soon as attention moves elsewhere.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Keep the badge in step with what the panel actually loaded.
  const serverUnread = data?.unread;
  useEffect(() => {
    if (serverUnread !== undefined) setUnread(serverUnread);
  }, [serverUnread, setUnread]);

  // Real-time notifications
  useEffect(() => {
    if (!me?.id) return;
    const channel = pusherClient.subscribe(`user-${me.id}`);
    channel.bind('new-notification', (notification: NotificationRow) => {
      setUnread(unread + 1);
      if (open) {
        mutate((current) => {
          if (!current) return { unread: 1, notifications: [notification] };
          return {
            unread: current.unread + 1,
            notifications: [notification, ...current.notifications].slice(0, 20),
          };
        });
      }
    });

    return () => {
      pusherClient.unsubscribe(`user-${me.id}`);
    };
  }, [me?.id, open, setUnread, unread, mutate]);

  const markAllRead = async () => {
    // Optimistic: the list is already on screen, and re-fetching to confirm a
    // read receipt is not worth the latency.
    const readAt = new Date().toISOString();
    mutate((current) => ({
      unread: 0,
      notifications: current.notifications.map((row) => ({ ...row, readAt: row.readAt ?? readAt })),
    }));
    setUnread(0);
    await api.patch('/api/notifications', { action: 'mark_all_read' }).catch(() => undefined);
  };

  const openNotification = async (row: NotificationRow) => {
    setOpen(false);
    if (!row.readAt) {
      setUnread(Math.max(0, unread - 1));
      await api
        .patch('/api/notifications', { action: 'mark_read', notificationId: row._id })
        .catch(() => undefined);
    }
    router.push(row.href);
  };

  return (
    <div className={styles.bellWrap} ref={wrapRef}>
      <button
        className={styles.iconButton}
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && <span className={styles.unreadDot}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            {unread > 0 && (
              <button
                className="row gap-1"
                onClick={markAllRead}
                style={{ fontSize: 'var(--t-xs)', color: 'var(--accent-text)', fontWeight: 550 }}
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.panelList}>
            {loading ? (
              <div className={styles.panelEmpty}>Loading…</div>
            ) : rows.length === 0 ? (
              <div className={styles.panelEmpty}>
                Nothing yet. Bookings, feedback, and deadlines will show up here.
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={row._id}
                  className={cn(styles.panelItem, !row.readAt && styles.panelItemUnread)}
                  onClick={() => openNotification(row)}
                >
                  <div className={styles.panelItemText}>
                    <div className={styles.panelItemTitle}>{row.title}</div>
                    {row.body && <div className={styles.panelItemBody}>{row.body}</div>}
                    <div className={styles.panelItemTime}>{timeAgo(row.createdAt)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
