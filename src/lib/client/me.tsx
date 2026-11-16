'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useApiQuery } from './hooks';
import type { SessionType, UserRole } from '@/lib/constants';

/**
 * The signed-in user's live figures.
 *
 * These deliberately come from `/api/me` rather than the session token: a JWT
 * is only reissued at sign-in, so points, karma, and streak stored on it would
 * be frozen at whatever they were that day. One fetch at shell mount keeps
 * every counter in the UI honest.
 */
export interface MentorProfile {
  acceptingBookings: boolean;
  offers: SessionType[];
  weeklyCapacity: number;
  headline: string;
  companies: string[];
}

export interface NotificationPrefs {
  sessionReminders: boolean;
  deadlineReminders: boolean;
  feedComments: boolean;
  digest: boolean;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  image: string;
  campus: string;
  batch: string;
  year: 1 | 2;
  role: UserRole;
  bio: string;
  specializations: string[];
  mentorProfile: MentorProfile;
  canMentor: boolean;
  points: number;
  karma: number;
  streak: number;
  longestStreak: number;
  badges: string[];
  mentorRating: number | null;
  mentorRatingCount: number;
  menteeRating: number | null;
  menteeRatingCount: number;
  sessionsHosted: number;
  sessionsAttended: number;
  leaderboardOptIn: boolean;
  notificationPrefs: NotificationPrefs;
  honorCodeAcceptedAt: string | null;
  onboardedAt: string | null;
  joinedAt: string;
}

interface CheckIn {
  streak: number;
  isNewDay: boolean;
  milestone: number | null;
  graceUsed: boolean;
}

interface MeResponse {
  user: Me;
  unreadNotifications: number;
  unreadMessages: number;
  checkIn: CheckIn;
}

interface MeApi {
  me: Me | null;
  loading: boolean;
  unread: number;
  unreadMessages: number;
  checkIn: CheckIn | null;
  refresh: () => Promise<void>;
  /** Applies a local patch so the shell updates without a round trip. */
  patch: (changes: Partial<Me>) => void;
  setUnread: (count: number) => void;
  setUnreadMessages: (count: number) => void;
}

const MeContext = createContext<MeApi | null>(null);

export function useMe(): MeApi {
  const context = useContext(MeContext);
  if (!context) throw new Error('useMe must be used within <MeProvider>');
  return context;
}

export function MeProvider({ children }: { children: React.ReactNode }) {
  /*
   * Built on `useApiQuery` so the fetch, abort, and settle logic lives in one
   * place. Local overrides sit on top of the fetched value, which lets an edit
   * elsewhere in the app update the shell immediately without a round trip and
   * without the provider copying server state into its own `useState` via an
   * effect.
   */
  const { data, loading, refetch } = useApiQuery<MeResponse>('/api/me');

  const [overrides, setOverrides] = useState<Partial<Me>>({});
  const [unreadOverride, setUnreadOverride] = useState<number | null>(null);
  const [unreadMessagesOverride, setUnreadMessagesOverride] = useState<number | null>(null);

  const me = useMemo(() => {
    if (!data) return null;
    return { ...data.user, ...overrides };
  }, [data, overrides]);

  const refresh = useCallback(async () => {
    // Server state supersedes anything applied locally.
    setOverrides({});
    setUnreadOverride(null);
    setUnreadMessagesOverride(null);
    refetch();
  }, [refetch]);

  const patch = useCallback((changes: Partial<Me>) => {
    setOverrides((current) => ({ ...current, ...changes }));
  }, []);

  const setUnread = useCallback((count: number) => setUnreadOverride(count), []);
  const setUnreadMessages = useCallback(
    (count: number) => setUnreadMessagesOverride(Math.max(0, count)),
    []
  );

  const unread = unreadOverride ?? data?.unreadNotifications ?? 0;

  const value = useMemo<MeApi>(
    () => ({
      me,
      loading,
      unread,
      unreadMessages: unreadMessagesOverride ?? data?.unreadMessages ?? 0,
      checkIn: data?.checkIn ?? null,
      refresh,
      patch,
      setUnread,
      setUnreadMessages,
    }),
    [me, loading, unread, unreadMessagesOverride, data, refresh, patch, setUnread, setUnreadMessages]
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}
