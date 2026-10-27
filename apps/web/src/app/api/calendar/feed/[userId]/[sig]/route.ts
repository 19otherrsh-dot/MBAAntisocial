import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifyFeed } from '@/server/modules/calendar/feed';
import { buildCalendar, icsResponse } from '@/server/modules/calendar/ics';
import { collectEvents } from '@/server/modules/calendar/providers';

/**
 * Personal ICS feed: classes, mock sessions, task deadlines, and whatever else
 * modules contribute. Authenticated by the signed path, not a cookie.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string; sig: string }> }) {
  const { userId, sig } = await params;
  const signature = sig.replace(/\.ics$/, '');
  if (!Types.ObjectId.isValid(userId)) return new Response('Not found', { status: 404 });
  await connectDB();
  const user = await User.findById(userId).select('name timezone calendarFeedVersion suspendedAt').lean();
  if (!user || user.suspendedAt || !verifyFeed(userId, user.calendarFeedVersion ?? 1, signature)) return new Response('Not found', { status: 404 });
  const events = await collectEvents({ id: userId, timeZone: user.timezone || 'Asia/Kolkata' });
  return icsResponse(buildCalendar('MBA Antisocial', events), 'mba-antisocial.ics');
}
