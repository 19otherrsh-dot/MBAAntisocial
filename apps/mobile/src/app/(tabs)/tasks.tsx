import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Empty, ErrorNote, Input, Loading, Muted, Row, Screen, Title } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useQuery } from '@/lib/query';
import { radius, useTheme } from '@/theme';
import type { TaskItem } from '@/types';

/** The next week as one-tap deadlines, each due at the end of that day; exact times are set on the web. */
/** The next week as one-tap days; a second row picks the time. */
function dueDays(from: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${day.toLocaleDateString(undefined, { weekday: 'short' })} ${day.getDate()}`;
    return { label, day };
  });
}

const DUE_TIMES = [
  { label: 'End of day', hour: 23, minute: 59 },
  { label: '9 am', hour: 9, minute: 0 },
  { label: 'Noon', hour: 12, minute: 0 },
  { label: '5 pm', hour: 17, minute: 0 },
  { label: '9 pm', hour: 21, minute: 0 },
] as const;

/** A horizontal row of single-choice chips. */
function ChipRow({ label, options, selected, onSelect }: { label: string; options: { key: string; label: string; disabled?: boolean }[]; selected: string; onSelect: (key: string) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days} keyboardShouldPersistTaps="handled" accessibilityLabel={label} accessibilityRole="radiogroup">
      {options.map((option) => {
        const on = option.key === selected;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: option.disabled }}
            accessibilityLabel={`${label}: ${option.label}`}
            disabled={option.disabled}
            onPress={() => onSelect(option.key)}
            style={[styles.day, { borderColor: on ? t.accent : t.lineStrong, backgroundColor: on ? t.accentSoft : t.surface, opacity: option.disabled ? 0.45 : 1 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.accentText : t.textSecondary }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The task list: tick things off, add one in a line. Habits and details live on the web. */
export default function Tasks() {
  const t = useTheme();
  const { data, error, loading, refreshing, refetch } = useQuery<{ tasks: TaskItem[]; summary: { pending: number; overdue: number; dueToday: number } }>('/api/tasks');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [days] = useState(() => dueDays(new Date()));
  const [hourNow] = useState(() => new Date().getHours());
  const [dayKey, setDayKey] = useState('none');
  const [timeKey, setTimeKey] = useState('0');
  const chosenDay = dayKey === 'none' ? null : days[Number(dayKey)].day;
  const chosenTime = DUE_TIMES[Number(timeKey)];
  const dueAt = chosenDay ? new Date(chosenDay.getFullYear(), chosenDay.getMonth(), chosenDay.getDate(), chosenTime.hour, chosenTime.minute, chosenTime.hour === 23 ? 59 : 0).toISOString() : null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await refetch();
    } catch (caught) {
      setActionError(errorText(caught));
    }
  };

  const add = async () => {
    if (!title.trim()) return;
    setAdding(true);
    await run(() => api.post('/api/tasks', { title: title.trim(), type: 'personal', ...(dueAt ? { dueAt } : {}) }));
    setTitle('');
    setDayKey('none');
    setTimeKey('0');
    setAdding(false);
  };

  // Recurring habits are materialised two weeks ahead; show each day's only once it is due.
  const [endOfToday] = useState(() => new Date(new Date().setHours(23, 59, 59, 999)).getTime());
  const tasks = (data?.tasks ?? []).filter(
    (task) => task.status !== 'completed' && !(task.recurrenceParent && task.dueAt && new Date(task.dueAt).getTime() > endOfToday)
  );

  return (
    <Screen refreshing={refreshing} onRefresh={refetch}>
      <Title>Tasks</Title>
      {data && (
        <Muted style={{ fontSize: 15 }}>
          {data.summary.overdue > 0 ? `${data.summary.overdue} overdue · ` : ''}
          {data.summary.dueToday} due today · {data.summary.pending} open
        </Muted>
      )}
      <View style={styles.add}>
        <View style={{ flex: 1 }}>
          <Input placeholder="Add a task" value={title} onChangeText={setTitle} returnKeyType="done" onSubmitEditing={add} />
        </View>
        <Button loading={adding} disabled={!title.trim()} onPress={add}>
          Add
        </Button>
      </View>
      {title.trim() !== '' && (
        <ChipRow label="Due" options={[{ key: 'none', label: 'No date' }, ...days.map((d, i) => ({ key: String(i), label: d.label }))]} selected={dayKey} onSelect={setDayKey} />
      )}
      {title.trim() !== '' && chosenDay && (
        <ChipRow
          label="Time"
          // Earlier today has already gone.
          options={DUE_TIMES.map((time, i) => ({ key: String(i), label: time.label, disabled: dayKey === '0' && hourNow >= time.hour && time.hour !== 23 }))}
          selected={timeKey}
          onSelect={setTimeKey}
        />
      )}
      {(error || actionError) && <ErrorNote message={(actionError ?? error)!} />}
      {loading && !data ? (
        <Loading />
      ) : tasks.length === 0 ? (
        <Empty title="Nothing open" body="Add what is actually due this week so future you does not find out the hard way." />
      ) : (
        <Card>
          {tasks.map((task) => {
            const overdue = Boolean(task.dueAt && new Date(task.dueAt).getTime() < now);
            return (
              <Row key={task._id}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Mark ${task.title} done`}
                  hitSlop={10}
                  onPress={() => run(() => api.patch('/api/tasks', { taskId: task._id, status: 'completed' }))}
                  style={[styles.check, { borderColor: overdue ? t.rose : t.lineStrong }]}
                />
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={2}>{task.title}</Body>
                  <Muted>
                    {task.course ? `${task.course} · ` : ''}
                    {task.dueAt ? `${overdue ? 'Was due' : 'Due'} ${new Date(task.dueAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'No deadline'}
                  </Muted>
                </View>
              </Row>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  add: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  days: { gap: 8, paddingVertical: 2 },
  day: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
