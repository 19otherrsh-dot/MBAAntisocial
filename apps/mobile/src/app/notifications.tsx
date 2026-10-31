import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Body, Button, Card, Empty, ErrorNote, Loading, Muted, Row, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { openHref } from '@/lib/links';
import { useQuery } from '@/lib/query';
import { useTheme } from '@/theme';

interface Notification {
  _id: string;
  title: string;
  body?: string;
  href?: string;
  createdAt: string;
  readAt?: string;
}

const ago = (iso: string, now: number) => {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** Everything the app has told you, newest first. Opening one marks it read and takes you there. */
export default function Notifications() {
  const t = useTheme();
  const { data, error, loading, refreshing, refetch } = useQuery<{ notifications: Notification[]; unread: number }>('/api/notifications?limit=50');
  const [actionError, setActionError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const markAll = async () => {
    setActionError(null);
    try {
      await api.patch('/api/notifications', { action: 'mark_all_read' });
      refetch();
    } catch (caught) {
      setActionError(errorText(caught));
    }
  };

  const open = (n: Notification) => {
    if (!n.readAt) void api.patch('/api/notifications', { action: 'mark_read', notificationId: n._id }).then(refetch, () => undefined);
    if (n.href) openHref(n.href);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () =>
            data && data.unread > 0 ? (
              <Button small variant="ghost" onPress={markAll}>
                Mark all read
              </Button>
            ) : null,
        }}
      />
      <Screen refreshing={refreshing} onRefresh={refetch} edges={['bottom']}>
        {(error || actionError) && <ErrorNote message={(actionError ?? error)!} />}
        {loading && !data ? (
          <Loading />
        ) : !data?.notifications.length ? (
          <Empty title="Nothing yet" body="Bookings, mentions, invites and reminders land here." />
        ) : (
          <Card>
            {data.notifications.map((n) => (
              <Row key={n._id} onPress={() => open(n)}>
                <View
                  accessibilityElementsHidden
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.readAt ? 'transparent' : t.accent, alignSelf: 'flex-start', marginTop: 7 }}
                />
                <View style={{ flex: 1, gap: 2 }} accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${n.title}`}>
                  <Body style={{ fontWeight: n.readAt ? '400' : '600' }} numberOfLines={2}>
                    {n.title}
                  </Body>
                  {n.body ? <Muted numberOfLines={2}>{n.body}</Muted> : null}
                  <Muted>{ago(n.createdAt, now)}</Muted>
                </View>
              </Row>
            ))}
          </Card>
        )}
      </Screen>
    </>
  );
}
