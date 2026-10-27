import { render } from '@react-email/render';
import { cronRoute, ok } from '@/lib/api/handler';
import { env } from '@/lib/env';
import User from '@/models/User';
import Resource from '@/models/Resource';
import InterviewSlot from '@/models/InterviewSlot';
import DigestEmail from '@/emails/DigestEmail';
import { container } from '@/server/container';

/**
 * Weekly campus digest for people who opted in. Goes through the email port,
 * so it works with Resend, SMTP, or the console fallback alike.
 */
export const GET = cronRoute(async () => {
  const users = await User.find({
    'notificationPrefs.digest': true,
    'notificationPrefs.email': { $ne: false },
    emailVerifiedAt: { $exists: true },
    suspendedAt: { $exists: false },
  })
    .select('name email campus')
    .lean();

  if (users.length === 0) return ok({ success: true, sentCount: 0 });

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const campuses = [...new Set(users.map((u) => u.campus))];
  let sentCount = 0;

  for (const campus of campuses) {
    const [topResources, openSessionsCount] = await Promise.all([
      Resource.find({ campus, createdAt: { $gte: oneWeekAgo }, hiddenAt: { $exists: false } })
        .sort({ upvoteCount: -1 })
        .limit(3)
        .select('title course upvoteCount')
        .lean(),
      InterviewSlot.countDocuments({ campus, status: 'available', startAt: { $gte: new Date() } }),
    ]);

    // Nothing worth an email is worth no email.
    if (topResources.length === 0 && openSessionsCount === 0) continue;

    for (const user of users.filter((u) => u.campus === campus)) {
      const element = DigestEmail({
        userName: user.name,
        campus,
        topResources: topResources.map((r) => ({ title: r.title, course: r.course, upvotes: r.upvoteCount })),
        openSessionsCount,
      }) as React.ReactElement;
      try {
        await container().email.send({
          to: user.email,
          subject: 'Your weekly campus digest',
          html: await render(element),
          text: await render(element, { plainText: true }),
          idempotencyKey: `digest:${user._id}:${oneWeekAgo.toISOString().slice(0, 10)}`,
        });
        sentCount += 1;
      } catch (error) {
        console.error(`[digest] failed for ${user.email}:`, error);
      }
    }
  }

  return ok({ success: true, sentCount, app: env.APP_URL });
});
