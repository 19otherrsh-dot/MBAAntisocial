import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { updateProfileSchema } from '@/lib/validation';
import { recordCheckIn } from '@/lib/gamification';
import { unreadCount } from '@/lib/notifications';
import User, { averageRating } from '@/models/User';
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

  const [user, unread] = await Promise.all([
    User.findById(actor.id)
      .select(
        'name email image campus batch year role bio specializations mentorProfile ' +
          'points karma streak longestStreak badges mentorRating menteeRating ' +
          'sessionsHosted sessionsAttended leaderboardOptIn notificationPrefs ' +
          'honorCodeAcceptedAt onboardedAt createdAt'
      )
      .lean(),
    unreadCount(actor.id),
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

    if (body.mentorProfile) {
      if (!actor.canMentor) {
        throw ApiError.forbidden('Only seniors and alumni can offer sessions.');
      }
      for (const [key, value] of Object.entries(body.mentorProfile)) {
        update[`mentorProfile.${key}`] = value;
      }
    }

    if (Object.keys(update).length === 0) {
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
