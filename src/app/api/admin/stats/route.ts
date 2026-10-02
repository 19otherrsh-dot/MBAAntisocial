import { route, ok } from '@/lib/api/handler';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import InterviewSlot from '@/models/InterviewSlot';
import Resource from '@/models/Resource';
import Application from '@/models/Application';
import InterviewQuestion from '@/models/InterviewQuestion';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Campus health, for moderators and placement staff.
 *
 * Goes through the shared `route()` wrapper rather than re-implementing the
 * session check inline: `requireModerator` is enforced in one place, and the
 * error envelope matches every other endpoint.
 *
 * The figures are chosen to answer the question a placement cell actually has —
 * *is this batch prepared* — which is the one thing the incumbent placement
 * ERPs cannot report, because they only ever see outcomes.
 */
export const GET = route({ requireModerator: true }, async ({ actor }) => {
  await connectDB();

  const campus = actor.campus;
  const activeSince = new Date(Date.now() - THIRTY_DAYS_MS);

  const [
    totalUsers,
    activeUsers,
    completedSessions,
    noShowSessions,
    openSlots,
    hostingMentors,
    totalMentors,
    studentsWithSession,
    totalResources,
    trackedApplications,
    offers,
    questionsLogged,
  ] = await Promise.all([
    User.countDocuments({ campus }),
    User.countDocuments({ campus, lastCheckInAt: { $gte: activeSince }, suspendedAt: { $exists: false } }),
    InterviewSlot.countDocuments({ campus, status: 'completed' }),
    InterviewSlot.countDocuments({ campus, status: 'no_show' }),
    InterviewSlot.countDocuments({ campus, status: 'available', startAt: { $gte: new Date() } }),
    User.countDocuments({ campus, 'mentorProfile.acceptingBookings': true }),
    User.countDocuments({ campus, year: 2 }),
    // Batch readiness: how many people have actually sat one, not how many
    // could have. This is the headline number for a placement cell.
    InterviewSlot.distinct('bookedBy', { campus, status: 'completed' }).then((ids) => ids.length),
    Resource.countDocuments({ campus, hiddenAt: { $exists: false } }),
    Application.countDocuments({ campus }),
    Application.countDocuments({ campus, stage: 'offer' }),
    InterviewQuestion.countDocuments({ campus, hiddenAt: { $exists: false } }),
  ]);

  const firstYears = await User.countDocuments({ campus, year: 1 });

  return ok({
    engagement: {
      totalUsers,
      activeUsers,
      activeShare: totalUsers === 0 ? 0 : Math.round((activeUsers / totalUsers) * 100),
    },
    preparation: {
      completedSessions,
      noShowSessions,
      openSlots,
      studentsWithSession,
      /** The share of first-years who have completed at least one mock. */
      readinessShare: firstYears === 0 ? 0 : Math.round((studentsWithSession / firstYears) * 100),
    },
    contribution: {
      hostingMentors,
      totalMentors,
      mentorShare: totalMentors === 0 ? 0 : Math.round((hostingMentors / totalMentors) * 100),
      totalResources,
      questionsLogged,
    },
    outcomes: {
      trackedApplications,
      offers,
    },
  });
});
