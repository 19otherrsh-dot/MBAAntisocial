export interface Component { name: string; weight: number; score?: number; max: number }

export interface CourseView {
  _id: string;
  term: string;
  code: string;
  name: string;
  professor: string;
  credits: number;
  color: string;
  requiredAttendance: number;
  plannedSessions: number | null;
  components: Component[];
  grade: string;
  attendance: {
    present: number; absent: number; cancelled: number;
    percent: number; canSkip: number; mustAttend: number; bestCase?: number; worstCase?: number; recoverable: boolean;
  };
  grades: { earned: number; gradedWeight: number; pendingWeight: number; currentPercent: number | null; points: number | null; neededFor: Record<string, number | null> };
}

export interface SlotView { _id: string; course: string; day: number; start: string; end: string; room: string; kind: string }
export interface TodayClass { slotId: string; courseId: string; name: string; code: string; color: string; start: string; end: string; room: string; kind: string; status: 'present' | 'absent' | 'cancelled' | null; day: string }

export interface AcademicsData {
  courses: CourseView[];
  termGpa: number | null;
  cgpa: number | null;
  scale: '4.33' | '4' | '10';
  terms: string[];
  settings: { gradeScale: '4.33' | '4' | '10'; currentTerm: string };
  slots: SlotView[];
  today: TodayClass[];
}
