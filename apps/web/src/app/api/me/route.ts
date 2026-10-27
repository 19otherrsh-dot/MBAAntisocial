import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { updateProfileSchema } from '@/lib/validation';
import { recordCheckIn } from '@/lib/gamification';
import { unreadCount } from '@/lib/notifications';
import User, { averageRating } from '@/models/User';
import ExternalAccount from '@/models/ExternalAccount';
import { MENTOR_ROLES, type UserRole } from '@/lib/constants';
import { campusDensity } from '@/server/modules/campus/service';
import { container } from '@/server/container';
import { invalidateAuthz } from '@/server/modules/auth/authz';

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
export const GET = route({ allowUnverified: true }, async ({ actor }) => {
  const checkIn = actor.verified ? await recordCheckIn(actor.id) : null;

  const [user, unread, connections, density] = await Promise.all([
    User.findById(actor.id)
      .select(
        'name email image campus batch year role bio specializations mentorProfile alumniProfile timezone ' +
          'points karma credits streak longestStreak badges mentorRating menteeRating authProviders emailVerifiedAt ' +
          'sessionsHosted sessionsAttended leaderboardOptIn notificationPrefs ' +
          'honorCodeAcceptedAt onboardedAt createdAt'
      )
      .lean(),
    unreadCount(actor.id),
    ExternalAccount.find({ user: actor.id }).select('provider accountEmail').lean(),
    actor.edition === 'campus' ? Promise.resolve(null) : campusDensity(actor.campus),
  ]);

  if (!user) throw ApiError.notFound('Your account could not be loaded.');

  const { meetings } = container();

  return ok({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image ?? '',
      campus: user.campus,
      campusSlug: actor.campusSlug,
      campusStatus: actor.campusStatus,
      edition: actor.edition,
      batch: user.batch,
      year: user.year,
      role: user.role,
      bio: user.bio ?? '',
      specializations: user.specializations ?? [],
      mentorProfile: user.mentorProfile,
      alumniProfile: user.alumniProfile,
      timezone: user.timezone ?? 'Asia/Kolkata',
      canMentor: MENTOR_ROLES.includes(user.role),
      canModerate: actor.canModerate,
      canReadReport: actor.canReadReport,
      canAdminCampus: actor.canAdminCampus,
      isPlatformAdmin: actor.isPlatformAdmin,
      points: user.points,
      karma: user.karma,
      credits: user.credits ?? 0,
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
      verified: Boolean(user.emailVerifiedAt),
      authProviders: user.authProviders ?? [],
      connections: connections.map((c) => ({ provider: c.provider, accountEmail: c.accountEmail })),
      meetingProviders: [...meetings.values()].map((p) => ({ id: p.id, label: p.label, requiresConnection: p.requiresConnection })),
      joinedAt: user.createdAt,
    },
    campusProgress: density,
    unreadNotifications: unread,
    checkIn: checkIn
      ? {
          streak: checkIn.streak,
          isNewDay: checkIn.isNewDay,
          milestone: checkIn.milestone ?? null,
          graceUsed: checkIn.graceUsed,
        }
      : { streak: user.streak, isNewDay: false, milestone: null, graceUsed: false },
  });
});

/** Profile and preference updates. */
export const PATCH = route({ body: updateProfileSchema, rateLimit: 'write', allowUnverified: true }, async ({ actor, body }) => {
  const current = await User.findById(actor.id).select('onboardedAt role year');
  if (!current) throw ApiError.notFound('Your account could not be loaded.');

  const update: Record<string, unknown> = {};

  if (body.name !== undefined) update.name = body.name;
  if (body.image !== undefined) update.image = body.image;
  if (body.bio !== undefined) update.bio = body.bio;
  if (body.specializations !== undefined) update.specializations = body.specializations;
  if (body.leaderboardOptIn !== undefined) update.leaderboardOptIn = body.leaderboardOptIn;
  if (body.timezone !== undefined) update.timezone = body.timezone;

  /*
   * Batch, year, and alumni status set the role, so they are only editable
   * during onboarding. Afterwards a change of year is an admin action, or a
   * second-year could quietly re-enter the first-year pool and vice versa.
   */
  const role = current.role as UserRole;
  const roleIsDerived = role === 'student' || role === 'mentor' || role === 'alumni';
  if (!current.onboardedAt) {
    if (body.batch !== undefined) update.batch = body.batch;
    if (body.year !== undefined) update.year = body.year;
    if (roleIsDerived && (body.year !== undefined || body.isAlumni !== undefined)) {
      const year = body.year ?? current.year;
      update.role = body.isAlumni ? 'alumni' : year === 2 ? 'mentor' : 'student';
    }
  } else if (body.batch !== undefined || body.year !== undefined || body.isAlumni !== undefined) {
    throw ApiError.forbidden('Batch and year are fixed after onboarding. Ask a campus admin to change them.');
  }

  // Dot-paths so a partial update does not clobber sibling keys.
  for (const [key, value] of Object.entries(body.notificationPrefs ?? {})) {
    update[`notificationPrefs.${key}`] = value;
  }

  const canMentorAfter = MENTOR_ROLES.includes((update.role as UserRole | undefined) ?? role);
  if (body.mentorProfile) {
    if (!canMentorAfter) throw ApiError.forbidden('Only seniors and alumni can offer sessions.');
    if (body.mentorProfile.meetingProvider && !container().meetings.has(body.mentorProfile.meetingProvider)) {
      throw ApiError.unprocessable('That meeting provider is not enabled on this deployment.');
    }
    for (const [key, value] of Object.entries(body.mentorProfile)) {
      update[`mentorProfile.${key}`] = value;
    }
  }

  for (const [key, value] of Object.entries(body.alumniProfile ?? {})) {
    update[`alumniProfile.${key}`] = value;
  }

  if (Object.keys(update).length === 0) throw ApiError.badRequest('Nothing to update.');

  if (!current.onboardedAt) update.onboardedAt = new Date();

  const user = await User.findByIdAndUpdate(actor.id, { $set: update }, { new: true, runValidators: true })
    .select('name bio specializations mentorProfile alumniProfile leaderboardOptIn notificationPrefs onboardedAt batch year role timezone')
    .lean();

  if (!user) throw ApiError.notFound('Your account could not be loaded.');

  if (update.role || update.batch || update.year) await invalidateAuthz(actor.id);
  return ok({ user });
});
