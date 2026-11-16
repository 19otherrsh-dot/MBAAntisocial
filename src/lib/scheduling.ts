import InterviewSlot from '@/models/InterviewSlot';
import User from '@/models/User';
import { startOfWeek, DAY_MS } from './time';
import { ApiError } from './api/errors';
import { CANCELLATION_NOTICE_HOURS, MAX_ACTIVE_BOOKINGS_PER_MENTEE } from './constants';

const HOUR_MS = 3_600_000;

/** Hours from now until `startAt`; negative once the slot has begun. */
export function hoursUntil(startAt: Date, now: Date = new Date()): number {
  return (startAt.getTime() - now.getTime()) / HOUR_MS;
}

/** True when acting on this slot now counts as a late cancellation. */
export function isInsideNoticeWindow(startAt: Date, now: Date = new Date()): boolean {
  return hoursUntil(startAt, now) < CANCELLATION_NOTICE_HOURS;
}

/**
 * Rejects a slot that would overlap another of the mentor's own slots.
 *
 * Without this a mentor can publish 10:00–11:00 twice and double-book
 * themselves. Two intervals overlap when each starts before the other ends.
 */
export async function assertNoMentorConflict(
  mentorId: string,
  startAt: Date,
  endAt: Date,
  excludeSlotId?: string
): Promise<void> {
  const query: Record<string, unknown> = {
    mentor: mentorId,
    status: { $in: ['available', 'booked'] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  };
  if (excludeSlotId) query._id = { $ne: excludeSlotId };

  const conflict = await InterviewSlot.findOne(query).select('startAt endAt').lean();
  if (conflict) {
    throw ApiError.conflict('That overlaps a slot you have already published.');
  }
}

/**
 * Enforces the per-mentee booking cap (§11 — senior burnout).
 *
 * Capping demand at the requester is what lets seniors keep availability open
 * without being flooded; the alternative is seniors quietly withdrawing, which
 * is the failure mode the PRD is trying to avoid.
 */
export async function assertBookingCapacity(menteeId: string): Promise<void> {
  const active = await InterviewSlot.countDocuments({
    bookedBy: menteeId,
    status: 'booked',
    startAt: { $gte: new Date() },
  });

  if (active >= MAX_ACTIVE_BOOKINGS_PER_MENTEE) {
    throw ApiError.conflict(
      `You already have ${MAX_ACTIVE_BOOKINGS_PER_MENTEE} sessions lined up. Finish one before booking another.`
    );
  }
}

/**
 * Enforces the mentor's own weekly capacity.
 *
 * The profile has always let a mentor say "three sessions a week", and the
 * product has always described that as a guarantee — but nothing read the
 * number. A mentor with ten open slots could be booked ten times. The count is
 * of live and completed sessions in the campus week the slot falls in, so a
 * cancelled booking frees its place.
 */
export async function assertMentorCapacity(mentorId: string, slotStart: Date): Promise<void> {
  const mentor = await User.findById(mentorId).select('mentorProfile.weeklyCapacity').lean();
  const capacity = mentor?.mentorProfile?.weeklyCapacity;
  if (capacity === undefined || capacity === null) return;

  const weekStart = startOfWeek(slotStart);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

  const taken = await InterviewSlot.countDocuments({
    mentor: mentorId,
    status: { $in: ['booked', 'completed'] },
    startAt: { $gte: weekStart, $lt: weekEnd },
  });

  if (taken >= capacity) {
    throw ApiError.conflict(
      'This mentor is fully booked that week. Pick a slot in another week, or try someone else.'
    );
  }
}

/**
 * Generates the video link for a booked session.
 *
 * §6.1 calls for auto-generated Meet/Zoom/Teams links via calendar APIs. Those
 * need per-institute OAuth that is not wired up yet, so this returns the
 * mentor's standing room link when they have set one and otherwise signals that
 * a link is still needed — rather than silently booking a session nobody can join.
 */
export function resolveMeetingLink(mentorLink: string): { link: string; needsLink: boolean } {
  const trimmed = mentorLink.trim();
  if (!trimmed) return { link: '', needsLink: true };
  return { link: trimmed, needsLink: false };
}

/** Whether `url` is a plausible https meeting link. */
export function isValidMeetingLink(url: string): boolean {
  if (!url) return true; // Optional field.
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
