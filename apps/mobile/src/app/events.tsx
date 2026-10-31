import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Body, Button, Card, Chip, Empty, ErrorNote, Loading, Muted, Row, Screen, Segmented } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useQuery } from '@/lib/query';
import { openWeb } from '@/lib/web';

interface CampusEvent {
  _id: string;
  title: string;
  category: string;
  startAt: string;
  endAt: string;
  venue: string;
  goingCount: number;
  capacity?: number | null;
  status: string;
  mine: { status: 'going' | 'interested' | 'waitlist' } | null;
  clubInfo: { name: string } | null;
}

type Scope = 'upcoming' | 'mine';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** What's on campus, and one tap to say you're going. Details, check-in and hosting are on the web. */
export default function Events() {
  const [scope, setScope] = useState<Scope>('upcoming');
  const { data, error, loading, refreshing, refetch } = useQuery<{ events: CampusEvent[] }>(`/api/events?scope=${scope}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rsvp = async (event: CampusEvent) => {
    setBusy(event._id);
    setActionError(null);
    try {
      await api.post(`/api/events/${event._id}`, { action: 'rsvp', status: event.mine ? null : 'going' });
      refetch();
    } catch (caught) {
      setActionError(errorText(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Events' }} />
      <Screen refreshing={refreshing} onRefresh={refetch} edges={['bottom']}>
        <Segmented
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'mine', label: 'Going' },
          ]}
          value={scope}
          onChange={setScope}
        />
        {(error || actionError) && <ErrorNote message={(actionError ?? error)!} />}
        {loading && !data ? (
          <Loading />
        ) : !data?.events.length ? (
          <Empty title={scope === 'mine' ? 'Nothing on your list' : 'Nothing scheduled'} body={scope === 'mine' ? 'Events you RSVP to show up here.' : 'Clubs post events as they plan them.'} />
        ) : (
          <Card>
            {data.events.map((event) => {
              const full = event.capacity != null && event.goingCount >= event.capacity && !event.mine;
              return (
                <Row key={event._id} onPress={() => openWeb(`/events/${event._id}`, event.title)}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Body style={{ fontWeight: '600' }} numberOfLines={2}>
                      {event.title}
                    </Body>
                    <Muted numberOfLines={1}>{[when(event.startAt), event.venue].filter(Boolean).join(' · ')}</Muted>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {event.clubInfo ? <Chip>{event.clubInfo.name}</Chip> : null}
                      <Chip tone="teal">{event.goingCount} going</Chip>
                      {event.mine?.status === 'waitlist' ? <Chip tone="amber">Waitlist</Chip> : null}
                    </View>
                  </View>
                  <Button small variant={event.mine ? 'secondary' : 'primary'} loading={busy === event._id} onPress={() => rsvp(event)} accessibilityLabel={event.mine ? `Cancel RSVP for ${event.title}` : `Going to ${event.title}`}>
                    {event.mine ? (event.mine.status === 'waitlist' ? 'Leave' : 'Going ✓') : full ? 'Waitlist' : 'Going'}
                  </Button>
                </Row>
              );
            })}
          </Card>
        )}
      </Screen>
    </>
  );
}
