import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import SessionTemplate from '@/models/SessionTemplate';

/** Toggle an upvote. Upvotes only sort templates; authors earn karma when they write one. */
export const POST = route({ rateLimit: 'write', feature: 'sessions' }, async ({ actor, params }) => {
  const id = objectId.parse(params.id);
  const template = await SessionTemplate.findOne({ _id: id, campus: actor.campus });
  if (!template) throw ApiError.notFound();
  if (String(template.author) === actor.id) throw ApiError.badRequest('You cannot upvote your own template.');
  const has = template.upvotes.some((u) => String(u) === actor.id);
  await SessionTemplate.updateOne(
    { _id: id },
    has ? { $pull: { upvotes: actor.id }, $inc: { upvoteCount: -1 } } : { $addToSet: { upvotes: actor.id }, $inc: { upvoteCount: 1 } }
  );
  return ok({ upvoted: !has });
});

export const DELETE = route({ rateLimit: 'write', feature: 'sessions' }, async ({ actor, params }) => {
  const id = objectId.parse(params.id);
  const filter = actor.canModerate ? { _id: id, campus: actor.campus } : { _id: id, author: actor.id };
  const result = await SessionTemplate.deleteOne(filter);
  if (result.deletedCount === 0) throw ApiError.notFound();
  return ok({ deleted: true });
});
