import GdQueueEntry from '@/models/GdQueueEntry';
import GdSession, { type IGdSession } from '@/models/GdSession';
import { notifyMany } from '@/lib/notifications';
import { env } from '@/lib/env';
import { formatDateTime } from '@/lib/utils';
import { container } from '../../container';
import { GD_MAX_PARTICIPANTS, GD_MIN_PARTICIPANTS, randomTopic } from './topics';

/** Hour-aligned window start, so "6:10" and "6:40" requests land in the same bucket. */
export function windowStart(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

/**
 * A room for a GD: the built-in LiveKit room when configured (works in the
 * apps too), otherwise a fresh Jitsi room.
 */
export async function gdMeeting(session: Pick<IGdSession, '_id' | 'topic' | 'startAt' | 'durationMinutes'>) {
  const { meetings } = container();
  if (meetings.has('livekit')) return { link: `${env.APP_URL}/meet/gd-${session._id}`, provider: 'livekit' };
  const jitsi = meetings.get('jitsi')!;
  const created = await jitsi.create({
    title: 'GD',
    description: session.topic,
    startsAt: session.startAt,
    endsAt: new Date(session.startAt.getTime() + session.durationMinutes * 60_000),
    host: { userId: '', email: '', name: '' },
    attendees: [],
    referenceId: String(session._id),
  });
  return { link: created.joinUrl, provider: 'jitsi' };
}

/**
 * Adds someone to the GD queue and forms rooms for any window that now has
 * enough people. Earliest joiners are matched first; a person is never put in
 * two rooms, because their queue entry is consumed when a room forms.
 */
export async function joinQueueAndMatch(input: { userId: string; campus: string; windows: Date[]; track: string }) {
  const windows = [...new Set(input.windows.map((w) => windowStart(w).getTime()))].sort().map((t) => new Date(t));
  await GdQueueEntry.findOneAndUpdate(
    { campus: input.campus, user: input.userId },
    { $set: { windows, track: input.track } },
    { upsert: true }
  );

  const formed: string[] = [];
  for (const window of windows) {
    const entries = await GdQueueEntry.find({ campus: input.campus, windows: window }).sort({ createdAt: 1 }).limit(GD_MAX_PARTICIPANTS).lean();
    if (entries.length < GD_MIN_PARTICIPANTS) continue;

    const participants = entries.map((e) => e.user);
    // Claim the entries; if another request claimed some first, skip this window.
    const claimed = await GdQueueEntry.deleteMany({ _id: { $in: entries.map((e) => e._id) } });
    if (claimed.deletedCount < GD_MIN_PARTICIPANTS) continue;

    const session = new GdSession({
      campus: input.campus,
      topic: randomTopic(),
      startAt: window,
      durationMinutes: 30,
      capacity: GD_MAX_PARTICIPANTS,
      participants,
      status: 'scheduled',
      origin: 'matched',
    });
    const meeting = await gdMeeting(session);
    session.meetingLink = meeting.link;
    session.meetingProvider = meeting.provider;
    await session.save();
    formed.push(String(session._id));

    await notifyMany(
      participants.map((user) => ({
        user,
        kind: 'gd_matched' as const,
        title: `You’re in a GD at ${formatDateTime(window)}`,
        body: `${participants.length} people. Topic revealed on the card — bring one statistic.`,
        href: '/sessions?view=gd',
        entityType: 'gd',
        entity: session._id,
      }))
    );
    if (participants.some((p) => String(p) === input.userId)) break;
  }
  return { formed };
}
