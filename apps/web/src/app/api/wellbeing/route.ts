import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { award } from '@/lib/gamification';
import Campus from '@/models/Campus';
import CheckIn, { STRESSORS } from '@/models/personal/CheckIn';
import User from '@/models/User';
import { dayKeyIn } from '@/server/modules/academics/service';
import { EMERGENCY, HELPLINES, supportSuggestion } from '@/server/modules/wellbeing/support';

/** Your own check-ins and trends, your campus's support, national helplines. */
export const GET = route({ feature: 'wellness' }, async ({ actor }) => {
  const user = await User.findById(actor.id).select('timezone').lean();
  const today = dayKeyIn(new Date(), user?.timezone || 'Asia/Kolkata');
  const [recent, campus] = await Promise.all([
    CheckIn.find({ user: actor.id }).sort({ day: -1 }).limit(30).lean(),
    Campus.findOne({ name: actor.campus }).select('support').lean(),
  ]);
  const last7 = recent.slice(0, 7);
  const prior7 = recent.slice(7, 14);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const stressorCounts = new Map<string, number>();
  for (const c of last7) for (const s of c.stressors) stressorCounts.set(s, (stressorCounts.get(s) ?? 0) + 1);

  return ok({
    today: recent.find((c) => c.day === today) ?? null,
    todayKey: today,
    history: recent.map((c) => ({ day: c.day, mood: c.mood, energy: c.energy, sleepHours: c.sleepHours ?? null, stressors: c.stressors })),
    insights: {
      moodWeek: avg(last7.map((c) => c.mood)),
      moodPriorWeek: avg(prior7.map((c) => c.mood)),
      energyWeek: avg(last7.map((c) => c.energy)),
      sleepWeek: avg(last7.flatMap((c) => (c.sleepHours != null ? [c.sleepHours] : []))),
      topStressors: [...stressorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s),
    },
    suggestion: supportSuggestion(recent.map((c) => c.mood)),
    support: { campus: campus?.support ?? null, helplines: HELPLINES, emergency: EMERGENCY },
    stressors: STRESSORS,
  });
});

const schema = z.object({
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  sleepHours: z.number().min(0).max(24).optional(),
  stressors: z.array(z.enum(STRESSORS)).max(5).default([]),
  note: z.string().trim().max(1000).default(''),
});

/** One check-in per day; a second save edits it. */
export const POST = route({ feature: 'wellness', body: schema, rateLimit: 'write' }, async ({ actor, body }) => {
  const user = await User.findById(actor.id).select('timezone').lean();
  const day = dayKeyIn(new Date(), user?.timezone || 'Asia/Kolkata');
  const result = await CheckIn.updateOne({ user: actor.id, day }, { $set: body }, { upsert: true });
  if (result.upsertedCount > 0) await award(actor.id, 'wellness_checkin');
  return ok({ saved: true, day });
});
