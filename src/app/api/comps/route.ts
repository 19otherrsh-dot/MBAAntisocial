import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { compQuerySchema, compActionSchema } from '@/lib/validation';
import { award, revoke } from '@/lib/gamification';
import CaseComp from '@/models/CaseComp';
import Task from '@/models/Task';
import type { QueryFilter } from 'mongoose';
import type { ICaseComp } from '@/models/CaseComp';

/**
 * The curated case-competition calendar (§6.4 MVP).
 *
 * Entries are seeded or added by moderators for now; the collection is already
 * shaped for the V3+ scraper, which writes rows with `source: 'imported'`.
 */
export const GET = route({ query: compQuerySchema }, async ({ actor, query }) => {
  const filter: QueryFilter<ICaseComp> = { archivedAt: { $exists: false } };

  if (!query.includePast) filter.registrationDeadline = { $gte: new Date() };
  if (query.category !== 'all') filter.category = query.category;
  if (query.saved) filter.savedBy = actor.id;

  // An empty `campuses` array means the comp is open to everyone.
  filter.$or = [{ campuses: { $size: 0 } }, { campuses: actor.campus }];

  const comps = await CaseComp.find(filter)
    .sort({ registrationDeadline: 1 })
    .limit(100)
    .lean();

  const categories = await CaseComp.distinct('category', { archivedAt: { $exists: false } });

  return ok({
    comps: comps.map((comp) => ({
      ...comp,
      _id: String(comp._id),
      savedBy: undefined,
      isSaved: (comp.savedBy ?? []).some((id) => id.toString() === actor.id),
      saveCount: (comp.savedBy ?? []).length,
      isGlobal: (comp.campuses ?? []).length === 0,
    })),
    categories: (categories as string[]).sort(),
  });
});

export const PATCH = route({ body: compActionSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const comp = await CaseComp.findById(body.compId);
  if (!comp) throw ApiError.notFound('That competition is no longer listed.');

  if (body.action === 'save') {
    await CaseComp.updateOne({ _id: comp._id }, { $addToSet: { savedBy: actor.id } });
    await award(actor.id, 'comp_saved', { entityType: 'comp', entity: comp._id });
    return ok({ isSaved: true });
  }

  if (body.action === 'unsave') {
    await CaseComp.updateOne({ _id: comp._id }, { $pull: { savedBy: actor.id } });
    await revoke(actor.id, 'comp_saved', comp._id);
    return ok({ isSaved: false });
  }

  /*
   * "Track" turns a listing into a real deadline in the user's own task list —
   * the join between §6.4's two halves. Without it the calendar is one more
   * page to remember to check, which is the problem it was meant to solve.
   */
  const existing = await Task.findOne({ user: actor.id, caseComp: comp._id });
  if (existing) throw ApiError.conflict('That is already on your task list.');

  const task = await Task.create({
    user: actor.id,
    title: `Register: ${comp.title}`,
    description: `${comp.host}${comp.prizePool ? ` · ${comp.prizePool}` : ''}\n${comp.url}`,
    type: 'case_comp',
    priority: 'high',
    dueAt: comp.registrationDeadline,
    caseComp: comp._id,
  });

  await CaseComp.updateOne({ _id: comp._id }, { $addToSet: { savedBy: actor.id } });

  return ok({ task: { ...task.toObject(), _id: String(task._id) }, isSaved: true });
});
