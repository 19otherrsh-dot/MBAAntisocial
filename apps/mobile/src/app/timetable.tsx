import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Body, Card, Empty, ErrorNote, Loading, Muted, Row, Screen, Segmented } from '@/components/ui';
import { useQuery } from '@/lib/query';
import { openWeb } from '@/lib/web';

interface Course {
  _id: string;
  code: string;
  name: string;
  professor?: string;
  color: string;
}
interface ClassSlot {
  _id: string;
  course: string;
  day: number;
  start: string;
  end: string;
  room: string;
}

const DAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
] as const;

/** The weekly timetable, a day at a time. Adding or importing courses happens on the web. */
export default function Timetable() {
  const { data, error, loading, refreshing, refetch } = useQuery<{ courses: Course[]; slots: ClassSlot[] }>('/api/academics');
  // Opens on today (Sunday shows Monday).
  const [day, setDay] = useState<string>(() => String(new Date().getDay() || 1));
  const courses = new Map((data?.courses ?? []).map((c) => [c._id, c]));
  const slots = (data?.slots ?? []).filter((s) => String(s.day) === day).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <>
      <Stack.Screen options={{ title: 'Timetable' }} />
      <Screen refreshing={refreshing} onRefresh={refetch} edges={['bottom']}>
        <Segmented options={DAYS} value={day as (typeof DAYS)[number]['value']} onChange={setDay} />
        {error && <ErrorNote message={error} />}
        {loading && !data ? (
          <Loading />
        ) : !data?.courses.length ? (
          <Empty title="No courses yet" body="Add your courses, or import the timetable from a photo, on the web." />
        ) : slots.length === 0 ? (
          <Empty title="No classes" body="Nothing scheduled on this day." />
        ) : (
          <Card>
            {slots.map((slot) => {
              const course = courses.get(slot.course);
              return (
                <Row key={slot._id}>
                  <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: course?.color ?? '#888' }} />
                  <View style={{ width: 64 }}>
                    <Body style={{ fontWeight: '600' }}>{slot.start}</Body>
                    <Muted>{slot.end}</Muted>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body numberOfLines={1}>{course ? `${course.code} · ${course.name}` : 'Class'}</Body>
                    <Muted numberOfLines={1}>{[slot.room, course?.professor].filter(Boolean).join(' · ')}</Muted>
                  </View>
                </Row>
              );
            })}
          </Card>
        )}
        <Row onPress={() => openWeb('/timetable', 'Timetable')}>
          <Muted>Edit courses or import from a photo on the web →</Muted>
        </Row>
      </Screen>
    </>
  );
}
