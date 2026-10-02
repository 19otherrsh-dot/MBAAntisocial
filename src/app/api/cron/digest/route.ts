import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { Resend } from 'resend';
import User from '@/models/User';
import Resource from '@/models/Resource';
import InterviewSlot from '@/models/InterviewSlot';
import DigestEmail from '@/emails/DigestEmail';
import connectDB from '@/lib/mongodb';

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

/**
 * Constant-time comparison.
 *
 * `!==` on secrets returns as soon as it finds a differing byte, so response
 * timing leaks how much of a guess was correct. Over enough requests that is
 * enough to recover the secret a character at a time.
 */
function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!secretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
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
            from: 'MBAAntisocial <digest@mbaantisocial.com>',
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
