import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, Muted, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/query';
import { openWeb } from '@/lib/web';
import type { Me } from '@/types';

/** Everything else. Timetable and events are native; the rest opens the web page, signed in. */
const NATIVE = new Set(['/timetable', '/events']);

const SECTIONS: { title: string; items: { label: string; path: string; hint?: string }[] }[] = [
  {
    title: 'Play',
    items: [
      { label: 'Games', path: '/games', hint: 'Ludo, chess, cards — online, vs bot, pass-and-play' },
      { label: 'Tournaments', path: '/tournaments' },
    ],
  },
  {
    title: 'Prep',
    items: [
      { label: 'Resume studio', path: '/resume' },
      { label: 'AI practice', path: '/practice' },
      { label: 'Applications', path: '/pipeline' },
      { label: 'Company wiki', path: '/companies' },
      { label: 'Alumni & referrals', path: '/alumni' },
    ],
  },
  {
    title: 'Academics',
    items: [
      { label: 'Timetable', path: '/timetable' },
      { label: 'Attendance', path: '/attendance' },
      { label: 'Grades & CGPA', path: '/grades' },
      { label: 'Notes & past papers', path: '/resources' },
    ],
  },
  {
    title: 'Campus',
    items: [
      { label: 'Feed', path: '/feed' },
      { label: 'Events', path: '/events' },
      { label: 'Clubs', path: '/clubs' },
      { label: 'Marketplace', path: '/marketplace' },
      { label: 'Mess menu', path: '/mess' },
    ],
  },
  {
    title: 'Discover',
    items: [
      { label: 'Daily briefing', path: '/briefing' },
      { label: 'Daily quiz', path: '/quiz' },
      { label: 'Jargon buster', path: '/jargon' },
    ],
  },
  {
    title: 'You',
    items: [
      { label: 'Money', path: '/money' },
      { label: 'Wellbeing', path: '/wellbeing', hint: 'Private check-ins, and real help when you need it' },
      { label: 'Profile', path: '/profile' },
      { label: 'Settings', path: '/settings' },
    ],
  },
];

export default function More() {
  const { signOut } = useAuth();
  const me = useQuery<{ user: Me }>('/api/me');
  const u = me.data?.user;
  const inbox = useQuery<{ unread: number }>('/api/notifications?limit=1');

  return (
    <Screen refreshing={me.refreshing} onRefresh={me.refetch}>
      <Title>More</Title>
      {u && (
        <Card>
          <Row>
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: '700' }}>{u.name}</Body>
              <Muted>
                {u.campus} · {u.batch}
              </Muted>
            </View>
            <Chip tone={u.edition === 'campus' ? 'teal' : 'accent'}>{u.edition === 'campus' ? 'Campus' : 'Open'}</Chip>
          </Row>
          <Row>
            <Muted style={{ flex: 1 }}>
              {u.streak}-day streak · {u.points} points · {u.karma} karma
            </Muted>
          </Row>
        </Card>
      )}
      <Card>
        <Row onPress={() => router.push('/notifications')}>
          <Body style={{ flex: 1 }}>Notifications</Body>
          {inbox.data && inbox.data.unread > 0 ? <Chip tone="accent">{`${inbox.data.unread} new`}</Chip> : null}
          <Muted>›</Muted>
        </Row>
      </Card>
      {SECTIONS.map((section) => (
        <Card key={section.title} title={section.title}>
          {section.items.map((item) => (
            <Row key={item.path} onPress={() => (NATIVE.has(item.path) ? router.push(item.path as '/timetable' | '/events') : openWeb(item.path, item.label))}>
              <View style={{ flex: 1 }}>
                <Body>{item.label}</Body>
                {item.hint && <Muted>{item.hint}</Muted>}
              </View>
              <Muted>›</Muted>
            </Row>
          ))}
        </Card>
      ))}
      <Button variant="danger" onPress={() => void signOut()}>
        Sign out
      </Button>
      <Button variant="ghost" onPress={() => router.push('/delete-account')}>
        Delete account
      </Button>
    </Screen>
  );
}
