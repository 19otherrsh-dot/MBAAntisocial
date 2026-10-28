import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SESSION_TYPE_META, type SessionType } from '@mba/shared/constants';
import { Body, Button, Card, Chip, ErrorNote, Loading, Muted, Row, Screen, Title } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/query';
import { openWeb } from '@/lib/web';
import { space, useTheme } from '@/theme';
import type { TodayResponse, TodayClass } from '@/types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summary(cards: TodayResponse['cards']): string {
  const parts: string[] = [];
  if (cards.classes?.length) parts.push(plural(cards.classes.length, 'class', 'classes'));
  if (cards.tasks?.overdue) parts.push(`${plural(cards.tasks.overdue, 'thing')} overdue`);
  if (cards.tasks?.dueToday) parts.push(`${cards.tasks.dueToday} due today`);
  const sessions = cards.agenda?.filter((a) => a.kind === 'session').length ?? 0;
  if (sessions) parts.push(plural(sessions, 'session'));
  if (!parts.length) return 'A clear day. Use it however you like.';
  const s = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

function when(iso: string, now: number) {
  const d = new Date(iso);
  const day = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const label = day === 0 ? 'Today' : day === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${label} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const t = useTheme();
  const { user } = useAuth();
  const { data, error, loading, refreshing, refetch } = useQuery<TodayResponse>('/api/today');
  const [now] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (caught) {
      setActionError(errorText(caught));
    }
  };

  const cards = data?.cards;

  return (
    <Screen refreshing={refreshing} onRefresh={refetch}>
      <View style={{ gap: 4 }}>
        <Title>
          {greeting(now)}, {user?.name.split(' ')[0] ?? 'there'}
        </Title>
        <Muted style={{ fontSize: 15 }}>{cards ? summary(cards) : 'Loading your day…'}</Muted>
      </View>

      {error && <ErrorNote message={error} />}
      {actionError && <ErrorNote message={actionError} />}
      {loading && !data && <Loading />}

      {cards?.openEdition && (
        <Card title="Already open to you">
          <Row onPress={() => openWeb('/sessions?scope=cross', 'Mock sessions')}>
            <View style={{ flex: 1 }}>
              <Body>{cards.openEdition.crossCampusSlots > 0 ? plural(cards.openEdition.crossCampusSlots, 'open slot') : 'Mentor slots'}</Body>
              <Muted>with seniors and alumni from other campuses</Muted>
            </View>
          </Row>
        </Card>
      )}

      {cards?.classes && (
        <Card title="Classes" action={<Link label="Timetable" onPress={() => openWeb('/timetable', 'Timetable')} />}>
          {cards.classes.length === 0 ? (
            <Row>
              <Muted>No classes today.</Muted>
            </Row>
          ) : (
            cards.classes.map((c) => (
              <ClassRow
                key={c.slotId}
                item={c}
                onMark={(status) => act(() => api.post('/api/academics/attendance', { course: c.courseId, day: c.day, slot: c.slotId, status: c.status === status ? null : status }))}
              />
            ))
          )}
        </Card>
      )}

      {cards?.tasks && (
        <Card title="Due">
          {cards.tasks.items.length === 0 ? (
            <Row>
              <Muted>Nothing due today.</Muted>
            </Row>
          ) : (
            cards.tasks.items.map((task) => (
              <Row key={task.id}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Mark ${task.title} done`}
                  hitSlop={10}
                  onPress={() => act(() => api.patch('/api/tasks', { taskId: task.id, status: 'completed' }))}
                  style={[styles.check, { borderColor: task.overdue ? t.rose : t.lineStrong }]}
                />
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{task.title}</Body>
                  <Muted>
                    {task.course ? `${task.course} · ` : ''}
                    {task.overdue ? 'Overdue' : task.dueAt ? when(task.dueAt, now) : 'No deadline'}
                  </Muted>
                </View>
              </Row>
            ))
          )}
        </Card>
      )}

      {cards?.agenda && (
        <Card title="Coming up">
          {cards.agenda.length === 0 ? (
            <Row>
              <Muted>No sessions or rounds in the next two days.</Muted>
            </Row>
          ) : (
            cards.agenda.map((item) => (
              <Row key={item.id}>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>
                    {item.kind === 'session'
                      ? `${SESSION_TYPE_META[item.sessionType as SessionType]?.label ?? 'Session'} ${item.role === 'host' ? 'for' : 'with'} ${item.with?.name ?? 'someone'}`
                      : `${item.label || 'Round'} · ${item.company}`}
                  </Body>
                  <Muted>{when(item.startAt, now)}</Muted>
                </View>
                {item.kind === 'session' && item.role === 'host' && <Chip tone="accent">Hosting</Chip>}
              </Row>
            ))
          )}
        </Card>
      )}

      {(cards?.briefing || cards?.quiz) && (
        <Card title="Five minutes of news">
          {cards.briefing?.headline && (
            <Row onPress={() => openWeb('/briefing', 'Briefing')}>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '600' }}>{cards.briefing.headline.title}</Body>
                <Muted>
                  {cards.briefing.headline.source}
                  {cards.briefing.count > 1 ? ` · and ${cards.briefing.count - 1} more` : ''}
                </Muted>
              </View>
            </Row>
          )}
          {cards.quiz && (
            <Row>
              <Muted style={{ flex: 1 }}>{cards.quiz.played ? `Quiz done: ${cards.quiz.score}/${cards.quiz.total}.` : `${cards.quiz.total} questions on business and current affairs.`}</Muted>
              {!cards.quiz.played && (
                <Button small variant="secondary" onPress={() => openWeb('/quiz', 'Daily quiz')}>
                  Take the quiz
                </Button>
              )}
            </Row>
          )}
        </Card>
      )}

      {cards?.checkIn && !cards.checkIn.done && (
        <Card>
          <Row onPress={() => openWeb('/wellbeing', 'Wellbeing')}>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '600' }}>How is today going?</Body>
              <Muted>A private, thirty-second check-in. Only you see it.</Muted>
            </View>
          </Row>
        </Card>
      )}

      {cards?.games && cards.games.length > 0 && (
        <Card title="Your table is waiting">
          {cards.games.map((g) => (
            <Row key={g.id} onPress={() => openWeb(`/games/room/${g.id}`, g.gameName)}>
              <Body style={{ flex: 1 }}>{g.gameName}</Body>
              <Chip tone="accent">Rejoin</Chip>
            </Row>
          ))}
        </Card>
      )}

      {cards?.events && cards.events.length > 0 && (
        <Card title="On campus">
          {cards.events.map((e) => (
            <Row key={e.id} onPress={() => openWeb(`/events/${e.id}`, 'Event')}>
              <View style={{ flex: 1 }}>
                <Body numberOfLines={1}>{e.title}</Body>
                <Muted>
                  {when(e.startAt, now)}
                  {e.venue ? ` · ${e.venue}` : ''}
                </Muted>
              </View>
              {e.going && <Chip tone="teal">Going</Chip>}
            </Row>
          ))}
        </Card>
      )}

      {cards && (
        <View style={styles.end}>
          <Text style={{ color: t.textSecondary, fontWeight: '600' }}>That’s today.</Text>
          <Muted>Everything else can wait until tomorrow.</Muted>
        </View>
      )}
    </Screen>
  );
}

function ClassRow({ item, onMark }: { item: TodayClass; onMark: (status: 'present' | 'absent' | 'cancelled') => void }) {
  const t = useTheme();
  const marks = [
    { value: 'present', label: 'Went', on: t.teal },
    { value: 'absent', label: 'Missed', on: t.rose },
    { value: 'cancelled', label: 'Off', on: t.textMuted },
  ] as const;
  return (
    <View style={styles.classRow}>
      <View style={[styles.swatch, { backgroundColor: item.color || t.accent }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Body numberOfLines={1} style={{ fontWeight: '600' }}>
          {item.code ? `${item.code} · ` : ''}
          {item.name}
        </Body>
        <Muted>
          {item.start}–{item.end}
          {item.room ? ` · ${item.room}` : ''}
        </Muted>
        <View style={styles.marks} role="radiogroup" aria-label={`Attendance for ${item.name}`}>
          {marks.map((m) => {
            const active = item.status === m.value;
            return (
              <Pressable
                key={m.value}
                role="radio"
                aria-checked={active}
                aria-label={`${m.label}: ${item.name}`}
                onPress={() => onMark(m.value)}
                style={[styles.mark, { borderColor: active ? m.on : t.lineStrong, backgroundColor: active ? m.on : 'transparent' }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : t.textSecondary }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={{ color: t.accentText, fontSize: 13, fontWeight: '600' }}>{label} →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  classRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  swatch: { width: 6, borderRadius: 3 },
  marks: { flexDirection: 'row', gap: 6, marginTop: 6 },
  mark: { paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: 999, borderWidth: 1 },
  end: { alignItems: 'center', gap: 4, paddingVertical: space.xl },
});
