import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { deleteAccount } from '@/lib/account/lifecycle';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { updateProfileSchema } from '@/lib/validation';
import { recordCheckIn } from '@/lib/gamification';
import { unreadCount } from '@/lib/notifications';
import User, { averageRating } from '@/models/User';
import Message from '@/models/Message';
import { MENTOR_ROLES } from '@/lib/constants';

/**
 * The live view of the signed-in user.
 *
 * Points, karma, and streak are served here rather than from the session token.
 * A JWT is only reissued at sign-in, so any counter embedded in it would show
 * whatever it was the day the user logged in and never move.
 *
 * Reading this endpoint also records the daily check-in, which is the natural
 * trigger: opening the app is the action a streak is meant to measure.
 */
export const GET = route({}, async ({ actor }) => {
  const checkIn = await recordCheckIn(actor.id);

  const [user, unread, unreadMessages] = await Promise.all([
    User.findById(actor.id)
      .select(
        'name email image campus batch year role bio specializations mentorProfile ' +
          'points karma streak longestStreak badges mentorRating menteeRating ' +
          'sessionsHosted sessionsAttended leaderboardOptIn notificationPrefs ' +
          'honorCodeAcceptedAt onboardedAt createdAt'
      )
      .lean(),
    unreadCount(actor.id),
    Message.countDocuments({ receiver: actor.id, read: false }),
  ]);

  if (!user) throw ApiError.notFound('Your account could not be loaded.');

  return ok({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image ?? '',
      campus: user.campus,
      batch: user.batch,
      year: user.year,
      role: user.role,
      bio: user.bio ?? '',
      specializations: user.specializations ?? [],
      mentorProfile: user.mentorProfile,
      canMentor: MENTOR_ROLES.includes(user.role),
      points: user.points,
      karma: user.karma,
      streak: user.streak,
      longestStreak: user.longestStreak,
      badges: user.badges ?? [],
      mentorRating: averageRating(user.mentorRating),
      mentorRatingCount: user.mentorRating?.count ?? 0,
      menteeRating: averageRating(user.menteeRating),
      menteeRatingCount: user.menteeRating?.count ?? 0,
      sessionsHosted: user.sessionsHosted,
      sessionsAttended: user.sessionsAttended,
      leaderboardOptIn: user.leaderboardOptIn,
      notificationPrefs: user.notificationPrefs,
      honorCodeAcceptedAt: user.honorCodeAcceptedAt ?? null,
      onboardedAt: user.onboardedAt ?? null,
      joinedAt: user.createdAt,
    },
    unreadNotifications: unread,
    unreadMessages,
    checkIn: {
      streak: checkIn.streak,
      isNewDay: checkIn.isNewDay,
      milestone: checkIn.milestone ?? null,
      graceUsed: checkIn.graceUsed,
    },
  });
});

/** Profile and preference updates. */
export const PATCH = route(
  { body: updateProfileSchema, rateLimit: 'write' },
  async ({ actor, body }) => {
    const update: Record<string, unknown> = {};

    if (body.name !== undefined) update.name = body.name;
    if (body.image !== undefined) update.image = body.image;
    if (body.bio !== undefined) update.bio = body.bio;
    if (body.specializations !== undefined) update.specializations = body.specializations;
    if (body.leaderboardOptIn !== undefined) update.leaderboardOptIn = body.leaderboardOptIn;

    // Dot-paths so a partial update does not clobber sibling keys.
    for (const [key, value] of Object.entries(body.notificationPrefs ?? {})) {
      update[`notificationPrefs.${key}`] = value;
    }

    /*
     * Year and batch come from the registration form, or — for single sign-on,
     * where the provider cannot know them — from onboarding. They are fixed
     * once onboarding is done: year decides whether someone can host mocks, so
     * it must not be a setting anyone can flip later. The only role change
     * allowed here is between student and the basic mentor role.
     */
    if (body.year !== undefined || body.batch !== undefined) {
      const current = await User.findById(actor.id).select('onboardedAt role').lean();
      if (current?.onboardedAt) {
        throw ApiError.forbidden('Year and batch are set at sign-up. Ask a campus admin to correct them.');
      }
      if (body.batch !== undefined) update.batch = body.batch;
      if (body.year !== undefined) {
        update.year = body.year;
        if (current?.role === 'student' && body.year === 2) update.role = 'mentor';
        if (current?.role === 'mentor' && body.year === 1) update.role = 'student';
      }
    }

    if (body.mentorProfile) {
      // Includes a second-year confirming their year in this same request.
      if (!actor.canMentor && update.role !== 'mentor') {
        throw ApiError.forbidden('Only seniors and alumni can offer sessions.');
      }
      for (const [key, value] of Object.entries(body.mentorProfile)) {
        update[`mentorProfile.${key}`] = value;
      }
    }

    if (Object.keys(update).length === 0 && !body.markOnboarded) {
      throw ApiError.badRequest('Nothing to update.');
    }

    update.onboardedAt = new Date();

    const user = await User.findByIdAndUpdate(
      actor.id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .select('name bio specializations mentorProfile leaderboardOptIn notificationPrefs onboardedAt')
      .lean();

    if (!user) throw ApiError.notFound('Your account could not be loaded.');

    return ok({ user });
  }
);

const deleteSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm.'),
  confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
});

/**
 * Deletes the caller's account. Needs the password, so an unattended laptop
 * or a stolen session cannot do it.
 */
export const DELETE = route({ body: deleteSchema, rateLimit: 'account' }, async ({ actor, body }) => {
  const user = await User.findById(actor.id).select('+password');
  if (!user || !(await user.comparePassword(body.password))) {
    throw ApiError.unprocessable('Some fields need fixing.', { password: 'That password is not right.' });
  }
  await deleteAccount(actor.id);
  // Recorded without the person's name: the account is gone, the fact that it
  // was deleted (and when) is what the institute may need to show.
  await recordAudit({
    actor: { id: actor.id, campus: actor.campus, role: actor.role },
    action: 'account.deleted',
    target: { type: 'user', id: actor.id },
  });
  return ok({ deleted: true });
});
