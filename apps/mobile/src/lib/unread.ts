import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { topics } from '@mba/shared/realtime';
import { useAuth } from './auth';
import { useQuery } from './query';
import { useTopics } from './realtime';

interface Unread {
  servers: Record<string, { unread: boolean; mentions: number }>;
  unreadDms: number;
}

/**
 * The Hub tab's badge: mentions plus unread direct messages, the things
 * addressed to you. Quiet channel traffic does not count, so the badge never
 * nags about conversations you were not part of.
 *
 * The count is the server's (`/api/hub/unread`). It is refetched when someone
 * else posts where you are a member, when the app comes back to the
 * foreground, and after navigation (reading a chat marks it read).
 */
export function useHubBadge(): string | undefined {
  const { user } = useAuth();
  const servers = useQuery<{ servers: { _id: string }[] }>('/api/hub/servers');
  // Outside the Campus Edition the hub is closed and both calls are refused; no badge then.
  const unread = useQuery<Unread>(servers.error ? null : '/api/hub/unread');
  const { refetch } = unread;

  // Bursts of activity (a busy channel) collapse into one request.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soon = useRef(() => {});
  useEffect(() => {
    soon.current = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refetch, 1500);
    };
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const watched = [...(user ? [topics.user(user.id)] : []), ...(servers.data?.servers ?? []).map((s) => topics.hubServer(s._id))];
  useTopics(watched, (envelope) => {
    if (envelope.event === 'hub.activity') {
      if ((envelope.data as { authorId?: string }).authorId !== user?.id) soon.current();
    } else if (envelope.event === 'dm.message.created') {
      const author = (envelope.data as { message?: { author?: { _id?: string } | null } }).message?.author?._id;
      if (author !== user?.id) soon.current();
    }
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && soon.current());
    return () => subscription.remove();
  }, []);

  const pathname = usePathname();
  const seen = useRef(pathname);
  useEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    soon.current();
  }, [pathname]);

  if (!unread.data) return undefined;
  const count = unread.data.unreadDms + Object.values(unread.data.servers).reduce((sum, s) => sum + s.mentions, 0);
  if (count === 0) return undefined;
  return count > 99 ? '99+' : String(count);
}
