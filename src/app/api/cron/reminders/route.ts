import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { isCronAuthorized } from '@/lib/cron';
import { runReminders } from '@/lib/jobs/reminders';

export const dynamic = 'force-dynamic';
// Reminders fan out to email; give a busy run room to finish.
export const maxDuration = 60;

/** Sends due reminders. Called by the scheduler; safe to call as often as you like. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return new NextResponse('Unauthorized', { status: 401 });
  await connectDB();
  const started = Date.now();
  const result = await runReminders();
  console.info(JSON.stringify({ level: 'info', msg: 'reminders run', ms: Date.now() - started, ...result }));
  return NextResponse.json({ ok: true, ...result });
}
