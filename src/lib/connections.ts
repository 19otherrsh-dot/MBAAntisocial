import InterviewSlot from '@/models/InterviewSlot';
import Message from '@/models/Message';
import Job from '@/models/Job';
import User from '@/models/User';
import { ApiError } from './api/errors';
import { MODERATOR_ROLES } from './constants';

/**
 * Who may message whom.
 *
 * The scheduling module exists because unstructured DMs to seniors are the
 * problem it replaces — structure, slots, and rubrics are the fix. An open
 * inbox reintroduces exactly that, and it bypasses the booking cap built to
 * stop seniors being flooded, since a DM respects no cap.
 *
 * So messaging is not a general capability. It unlocks between two people once
 * something has actually happened between them:
 *
 *  1. They completed a session together — follow-up after a mock is the whole
 *     point, and both parties chose to be there.
 *  2. The other person messaged first — a reply must always work, or the
 *     feature is a trap.
 *  3. One of them posted an opportunity inviting contact — posting a referral
 *     offer *is* the opt-in, so honouring it is not a loophole.
 *  4. A moderator is involved — moderation needs to be able to reach people.
 *
 * Everything else is a cold DM, which is the behaviour this product sells
 * against.
 */

export type ConnectionReason =
  | 'completed_session'
  | 'existing_thread'
  | 'open_to_contact'
  | 'moderator';

export interface ConnectionCheck {
  allowed: boolean;
  reason?: ConnectionReason;
}

export async function checkConnection(
  actorId: string,
  actorRole: string,
  peerId: string
): Promise<ConnectionCheck> {
  if (actorId === peerId) return { allowed: false };

  if (MODERATOR_ROLES.includes(actorRole as never)) {
    return { allowed: true, reason: 'moderator' };
  }

  /*
   * Campus is checked before anything else. Nothing else in the product crosses
   * campuses, and an un-scoped inbox would be the one hole through which a
   * stranger at another institute could reach a student.
   */
  const [actor, peer] = await Promise.all([
    User.findById(actorId).select('campus').lean(),
    User.findById(peerId).select('campus role').lean(),
  ]);

  if (!actor || !peer) return { allowed: false };

  // Alumni keep access to their own campus after graduating.
  if (actor.campus !== peer.campus) return { allowed: false };

  const [sharedSession, priorMessage, openOffer] = await Promise.all([
    InterviewSlot.exists({
      status: 'completed',
      $or: [
        { mentor: actorId, bookedBy: peerId },
        { mentor: peerId, bookedBy: actorId },
      ],
    }),
    // Only a message *from* the peer opens the thread. A message the actor sent
    // cannot be its own justification, or the gate opens itself.
    Message.exists({ sender: peerId, receiver: actorId }),
    Job.exists({ author: peerId, isActive: true, invitesContact: true }),
  ]);

  if (sharedSession) return { allowed: true, reason: 'completed_session' };
  if (priorMessage) return { allowed: true, reason: 'existing_thread' };
  if (openOffer) return { allowed: true, reason: 'open_to_contact' };

  return { allowed: false };
}

/** Throws a 403 explaining how to unlock the conversation. */
export async function assertCanMessage(
  actorId: string,
  actorRole: string,
  peerId: string
): Promise<ConnectionReason> {
  const result = await checkConnection(actorId, actorRole, peerId);

  if (!result.allowed) {
    throw ApiError.forbidden(
      'You can message someone once you have completed a session together, or if they have posted an opportunity inviting contact. Book a slot with them instead of a cold message.'
    );
  }

  return result.reason!;
}
