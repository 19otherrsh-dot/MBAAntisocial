import type { Actor } from '@/lib/api/handler';
import InterviewSlot from '@/models/InterviewSlot';
import GdSession from '@/models/GdSession';

/**
 * Who may enter which built-in video room. Room names carry their kind as a
 * prefix; each kind is authorised by the module that owns it. Adding a kind
 * (hub voice channels, team calls) is one more entry in `RESOLVERS`.
 */
export interface RoomAccess {
  allowed: boolean;
  title: string;
  /** Whether the participant may publish audio/video, or only listen. */
  canPublish: boolean;
  /** Where "Leave" goes. */
  backHref: string;
}

type Resolver = (actor: Actor, id: string) => Promise<RoomAccess>;

const DENY: RoomAccess = { allowed: false, title: '', canPublish: false, backHref: '/home' };

const RESOLVERS: Record<string, Resolver> = {
  session: async (actor, id) => {
    if (!/^[a-f0-9]{24}$/.test(id)) return DENY;
    const slot = await InterviewSlot.findById(id).select('mentor bookedBy status sessionType').lean();
    if (!slot || slot.status !== 'booked') return DENY;
    const isIn = String(slot.mentor) === actor.id || String(slot.bookedBy) === actor.id;
    return isIn ? { allowed: true, title: 'Mock session', canPublish: true, backHref: '/sessions?view=bookings' } : DENY;
  },
  gd: async (actor, id) => {
    if (!/^[a-f0-9]{24}$/.test(id)) return DENY;
    const gd = await GdSession.findById(id).select('participants moderator status topic').lean();
    if (!gd || gd.status === 'cancelled' || gd.status === 'completed') return DENY;
    const isIn = String(gd.moderator ?? '') === actor.id || gd.participants.some((p) => String(p) === actor.id);
    return isIn ? { allowed: true, title: `GD: ${gd.topic}`, canPublish: true, backHref: '/sessions?view=gd' } : DENY;
  },
  hub: async (actor, id) => (await import('../hub/voice')).voiceRoomAccess(actor, id),
};

export async function resolveRoom(actor: Actor, room: string): Promise<RoomAccess> {
  const dash = room.indexOf('-');
  if (dash < 0) return DENY;
  const resolver = RESOLVERS[room.slice(0, dash)];
  return resolver ? resolver(actor, room.slice(dash + 1)) : DENY;
}
