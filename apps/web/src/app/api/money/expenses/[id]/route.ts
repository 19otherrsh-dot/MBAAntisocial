import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import Expense from '@/models/personal/Expense';

export const DELETE = route({ feature: 'budget', rateLimit: 'write' }, async ({ actor, params }) => {
  const removed = await Expense.findOneAndDelete({ _id: objectId.parse(params.id), user: actor.id });
  if (!removed) throw ApiError.notFound('That expense does not exist.');
  return ok({ deleted: true });
});
