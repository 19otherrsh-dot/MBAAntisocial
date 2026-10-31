export type { TodayClass, TodayCards, TodayResponse } from '@mba/shared/today';

export interface Me {
  id: string;
  name: string;
  email: string;
  image: string;
  campus: string;
  edition: 'open' | 'campus' | 'none';
  role: string;
  batch: string;
  year: 1 | 2;
  points: number;
  karma: number;
  streak: number;
  longestStreak: number;
}

export interface Slot {
  _id: string;
  startAt: string;
  endAt: string;
  sessionType: string;
  status: string;
  campus: string;
  note?: string;
  /** The host's note on the slot (what to prepare, format). */
  notes?: string;
  meetingLink?: string;
  viewerRole: 'mentor' | 'mentee' | 'observer';
  mentor: { _id: string; name: string; campus?: string; mentorProfile?: { headline?: string } } | null;
  bookedBy?: { _id: string; name: string } | null;
}

export interface TaskItem {
  _id: string;
  title: string;
  course: string;
  type: string;
  status: string;
  dueAt?: string | null;
  /** Set on instances of a recurring habit. */
  recurrenceParent?: string | null;
}

export interface HubServer {
  _id: string;
  name: string;
  kind: string;
}

export interface HubChannel {
  _id: string;
  name: string;
  kind: string;
  unread: boolean;
  canSend: boolean;
}

export interface Conversation {
  _id: string;
  name?: string;
  participants: { _id: string; name: string }[];
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unread: boolean;
}

export interface ChatMessage {
  _id: string;
  author: { _id: string; name: string } | null;
  content: string;
  createdAt: string;
}
