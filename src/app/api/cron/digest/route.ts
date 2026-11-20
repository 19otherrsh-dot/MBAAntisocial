import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron';
import { Resend } from 'resend';
import User from '@/models/User';
import Resource from '@/models/Resource';
import InterviewSlot from '@/models/InterviewSlot';
import DigestEmail from '@/emails/DigestEmail';
import connectDB from '@/lib/mongodb';
import { env } from '@/lib/env';

/**
 * Constructed per request rather than at module scope.
 *
 * `new Resend(undefined)` throws, and at module scope that throw happens while
 * Next collects page data — so a missing key failed the entire production build
 * rather than the one route that needs it. Email is optional infrastructure;
 * it must not be able to break a deploy that does not use it.
 */
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const resend = getResend();
  if (!resend) {
    return NextResponse.json(
      { error: 'Email is not configured. Set RESEND_API_KEY to enable the digest.' },
      { status: 503 }
    );
  }

  try {
    await connectDB();

    // 1. Fetch users opted into digest
    const users = await User.find({
      'notificationPrefs.digest': true,
      suspendedAt: { $exists: false },
    }).lean();

    if (users.length === 0) {
      return NextResponse.json({ success: true, message: 'No users opted in' });
    }

    // Process campus by campus
    const campuses = [...new Set(users.map((u) => u.campus))];
    let sentCount = 0;

    for (const campus of campuses) {
      const campusUsers = users.filter((u) => u.campus === campus);

      // Fetch top 3 resources from the last 7 days
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const topResources = await Resource.find({
        campus,
        createdAt: { $gte: oneWeekAgo },
        hiddenAt: { $exists: false },
      })
        .sort({ upvoteCount: -1 })
        .limit(3)
        .select('title course upvoteCount')
        .lean();

      // Fetch open mock sessions
      const openSessionsCount = await InterviewSlot.countDocuments({
        campus,
        status: 'available',
        startAt: { $gte: new Date() },
      });

      if (topResources.length === 0 && openSessionsCount === 0) {
        continue; // Nothing interesting to report for this campus
      }

      // Send emails
      for (const user of campusUsers) {
        try {
          await resend.emails.send({
            from: env.EMAIL_FROM,
            to: user.email,
            subject: 'Your Weekly Campus Digest',
            react: DigestEmail({
              userName: user.name,
              campus,
              topResources: topResources.map(r => ({ title: r.title, course: r.course, upvotes: r.upvoteCount })),
              openSessionsCount,
            }) as React.ReactElement,
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to send digest to ${user.email}`, err);
        }
      }
    }

    return NextResponse.json({ success: true, sentCount });
  } catch (error) {
    console.error('Digest Cron Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
