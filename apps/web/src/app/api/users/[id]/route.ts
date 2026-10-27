import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import User, { averageRating } from '@/models/User';
import Campus from '@/models/Campus';
import InterviewSlot from '@/models/InterviewSlot';
import { checkConnection } from '@/lib/connections';
import { BADGE_BY_ID, MENTOR_ROLES } from '@/lib/constants';

/**
 * A public profile. Visible within the viewer's campus, and across campuses
 * only for a mentor who opted in to cross-campus bookings — anyone else at
 * another school reports as not found, so ids cannot be probed.
 */
export const GET = route({}, async ({ actor, params }) => {
  const id = objectId.parse(params.id);
  const user = await User.findById(id)
    .select('name image campus batch year role bio specializations mentorProfile alumniProfile karma badges mentorRating sessionsHosted leaderboardOptIn streak suspendedAt createdAt')
    .lean();
  if (!user || user.suspendedAt) throw ApiError.notFound('No such person.');

  const sameCampus = user.campus === actor.campus;
  if (!sameCampus) {
    const viewerCampus = await Campus.findOne({ name: actor.campus }).select('settings.crossCampusMentors').lean();
    const crossOk = user.mentorProfile?.crossCampus && viewerCampus?.settings?.crossCampusMentors !== false;
    if (!crossOk) throw ApiError.notFound('No such person.');
  }

  const [openSlots, connection] = await Promise.all([
    InterviewSlot.countDocuments({ mentor: id, status: 'available', startAt: { $gt: new Date() } }),
    actor.id === String(id) ? Promise.resolve({ allowed: false }) : checkConnection(actor.id, actor.role, String(id)),
  ]);

  const isMentor = MENTOR_ROLES.includes(user.role);
  return ok({
    user: {
      id: String(user._id),
      name: user.name,
      image: user.image ?? '',
      campus: user.campus,
      batch: user.batch,
      year: user.year,
      role: user.role,
      bio: user.bio ?? '',
      specializations: user.specializations ?? [],
      // Karma is public (it is the giving metric); points and streak only if they opted into ranking.
      karma: user.karma,
      streak: user.leaderboardOptIn ? user.streak : null,
      badges: (user.badges ?? []).map((b) => BADGE_BY_ID.get(b)).filter(Boolean),
      mentor: isMentor
        ? {
            acceptingBookings: user.mentorProfile?.acceptingBookings ?? false,
            headline: user.mentorProfile?.headline ?? '',
            offers: user.mentorProfile?.offers ?? [],
            companies: user.mentorProfile?.companies ?? [],
            rating: averageRating(user.mentorRating),
            ratingCount: user.mentorRating?.count ?? 0,
            sessionsHosted: user.sessionsHosted,
            openSlots,
          }
        : null,
      alumni:
        user.role === 'alumni'
          ? {
              company: user.alumniProfile?.company ?? '',
              designation: user.alumniProfile?.designation ?? '',
              graduationYear: user.alumniProfile?.graduationYear ?? null,
              referralsOpen: user.alumniProfile?.referralsOpen ?? false,
              linkedinUrl: user.alumniProfile?.linkedinUrl ?? '',
            }
          : null,
      joinedAt: user.createdAt,
    },
    viewer: { isSelf: actor.id === String(id), canMessage: connection.allowed, sameCampus },
  });
});
