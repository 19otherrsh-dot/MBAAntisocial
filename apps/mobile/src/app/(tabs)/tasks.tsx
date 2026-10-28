import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Body, Button, Card, Empty, ErrorNote, Input, Loading, Muted, Row, Screen, Title } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useQuery } from '@/lib/query';
import { useTheme } from '@/theme';
import type { TaskItem } from '@/types';

/** The task list: tick things off, add one in a line. Habits and details live on the web. */
export default function Tasks() {
  const t = useTheme();
  const { data, error, loading, refreshing, refetch } = useQuery<{ tasks: TaskItem[]; summary: { pending: number; overdue: number; dueToday: number } }>('/api/tasks');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
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
    await run(() => api.post('/api/tasks', { title: title.trim(), type: 'personal' }));
    setTitle('');
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
});
