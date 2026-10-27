import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import MessMenu, { MEALS } from '@/models/campus/MessMenu';
import MessRating from '@/models/campus/MessRating';
import User from '@/models/User';
import { dayKeyIn } from '@/server/modules/academics/service';

/** Monday of the week containing `day` (YYYY-MM-DD). */
function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

const querySchema = z.object({ mess: z.string().trim().max(60).optional(), week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const GET = route({ feature: 'mess', query: querySchema }, async ({ actor, query }) => {
  const user = await User.findById(actor.id).select('timezone').lean();
  const today = dayKeyIn(new Date(), user?.timezone || 'Asia/Kolkata');
  const weekStart = mondayOf(query.week ?? today);
  const messes: string[] = await MessMenu.distinct('mess', { campus: actor.campus });
  const mess = query.mess ?? messes[0] ?? 'Main mess';
  const end = new Date(`${weekStart}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const weekEnd = end.toISOString().slice(0, 10);

  const [menu, ratings, mine] = await Promise.all([
    MessMenu.findOne({ campus: actor.campus, mess, weekStart }).lean(),
    MessRating.aggregate<{ _id: { day: string; meal: string }; avg: number; count: number }>([
      { $match: { campus: actor.campus, mess, day: { $gte: weekStart, $lte: weekEnd } } },
      { $group: { _id: { day: '$day', meal: '$meal' }, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    MessRating.find({ user: actor.id, mess, day: { $gte: weekStart, $lte: weekEnd } }).select('day meal rating').lean(),
  ]);
  return ok({
    messes: messes.length ? messes : [mess],
    mess,
    weekStart,
    today,
    menu: menu?.days ?? null,
    ratings: ratings.map((r) => ({ day: r._id.day, meal: r._id.meal, avg: Math.round(r.avg * 10) / 10, count: r.count })),
    mine: mine.map((r) => ({ day: r.day, meal: r.meal, rating: r.rating })),
    canEdit: actor.canModerate || actor.canAdminCampus,
    meals: MEALS,
  });
});

const daySchema = z.object(Object.fromEntries(MEALS.map((m) => [m, z.array(z.string().trim().min(1).max(60)).max(15)])) as Record<(typeof MEALS)[number], z.ZodArray<z.ZodString>>);
const putSchema = z.object({ mess: z.string().trim().min(2).max(60), weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.array(daySchema).length(7) });

/** The mess committee (campus moderators) publishes the week's menu. */
export const PUT = route({ feature: 'mess', body: putSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  if (!actor.canModerate && !actor.canAdminCampus) throw ApiError.forbidden('Only the mess committee can edit the menu.');
  await MessMenu.updateOne({ campus: actor.campus, mess: body.mess, weekStart: mondayOf(body.weekStart) }, { $set: { days: body.days, updatedBy: actor.id } }, { upsert: true });
  return ok({ saved: true });
});

const rateSchema = z.object({ mess: z.string().trim().min(2).max(60), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), meal: z.enum(MEALS), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(280).default('') });

/** Rate a meal you have had (today or earlier). */
export const POST = route({ feature: 'mess', body: rateSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const user = await User.findById(actor.id).select('timezone').lean();
  if (body.day > dayKeyIn(new Date(), user?.timezone || 'Asia/Kolkata')) throw ApiError.badRequest('Rate it after you have eaten it.');
  await MessRating.updateOne({ user: actor.id, mess: body.mess, day: body.day, meal: body.meal }, { $set: { campus: actor.campus, rating: body.rating, comment: body.comment } }, { upsert: true });
  return ok({ saved: true });
});
