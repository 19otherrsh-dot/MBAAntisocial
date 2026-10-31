import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SESSION_TYPE_META, type SessionType } from '@mba/shared/constants';
import { Body, Button, Card, Chip, Empty, ErrorNote, Loading, Muted, Row, Screen, Segmented, Title } from '@/components/ui';
import { useQuery } from '@/lib/query';
import { openWeb } from '@/lib/web';
import type { Me, Slot } from '@/types';

type View_ = 'open' | 'bookings';

const time = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Mock sessions. On the Open Edition the list is mentors from other campuses
 * who opted in; the server enforces which slots each person may book.
 */
export default function Prep() {
  const me = useQuery<{ user: Me }>('/api/me');
  const openEdition = me.data?.user.edition === 'open';
  // Arriving back from a booking opens "My sessions".
  const params = useLocalSearchParams<{ view?: View_ }>();
  const [view, setView] = useState<View_>(params.view === 'bookings' ? 'bookings' : 'open');
  const path = me.data ? (view === 'open' ? `/api/sessions?view=open&scope=${openEdition ? 'cross' : 'campus'}&limit=30` : '/api/sessions?view=bookings&limit=30') : null;
  const { data, error, loading, refreshing, refetch } = useQuery<{ slots: Slot[] }>(path);

  // Booking has a note, a template and consent to choose, so it gets its own screen.
  const book = (slot: Slot) => router.push({ pathname: '/book/[id]', params: { id: slot._id, slot: JSON.stringify(slot) } });

  const [now] = useState(() => new Date().toISOString());
  const slots = (data?.slots ?? []).filter((s) => (view === 'open' ? true : s.status === 'booked' && s.endAt > now));

  return (
    <Screen refreshing={refreshing} onRefresh={refetch}>
      <Title>Prep</Title>
      <Segmented
        options={[
          { value: 'open', label: 'Open slots' },
          { value: 'bookings', label: 'My sessions' },
        ]}
        value={view}
        onChange={setView}
      />
      {openEdition && view === 'open' && <Muted>Your campus’s own seniors appear once it unlocks. These mentors from other campuses opted in to help anyone.</Muted>}
      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <Loading />
      ) : slots.length === 0 ? (
        <Empty
          title={view === 'open' ? 'No open slots right now' : 'Nothing booked'}
          body={view === 'open' ? 'Seniors publish new windows every week. Pull to refresh later.' : 'Book a slot from Open slots — it lands here with its meeting link.'}
        />
      ) : (
        <Card>
          {slots.map((slot) => (
            <Row key={slot._id}>
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: '600' }}>{SESSION_TYPE_META[slot.sessionType as SessionType]?.label ?? 'Session'}</Body>
                <Muted>
                  {time(slot.startAt)} · {slot.viewerRole === 'mentor' ? `with ${slot.bookedBy?.name ?? 'a junior'}` : slot.mentor?.name}
                </Muted>
                {slot.mentor?.mentorProfile?.headline && view === 'open' ? <Muted numberOfLines={1}>{slot.mentor.mentorProfile.headline}</Muted> : null}
                {slot.mentor?.campus && slot.campus && openEdition ? <Chip>{slot.mentor.campus}</Chip> : null}
              </View>
              {view === 'open' ? (
                <Button small onPress={() => book(slot)}>
                  Book
                </Button>
              ) : slot.meetingLink ? (
                <Button small variant="secondary" onPress={() => Linking.openURL(slot.meetingLink!)}>
                  Join
                </Button>
              ) : null}
            </Row>
          ))}
        </Card>
      )}
      <Button variant="ghost" onPress={() => openWeb('/practice', 'AI practice')}>
        No senior free? Practise with the AI interviewer
      </Button>
    </Screen>
  );
}
