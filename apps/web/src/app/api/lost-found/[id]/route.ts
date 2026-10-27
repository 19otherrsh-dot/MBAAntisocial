import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { notify } from '@/lib/notifications';
import LostItem from '@/models/campus/LostItem';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resolve') }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('contact'), message: z.string().trim().min(3).max(300) }),
]);

export const POST = route({ feature: 'feed', body: schema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  const item = await LostItem.findOne({ _id: objectId.parse(params.id), campus: actor.campus });
  if (!item) throw ApiError.notFound('That post does not exist.');
  const mine = String(item.reporter) === actor.id;
  if (body.action === 'contact') {
    if (mine) throw ApiError.badRequest('That is your own post.');
    await notify({
      user: item.reporter,
      kind: 'system',
      title: item.kind === 'lost' ? `${actor.name} may have found your ${item.title}` : `${actor.name} thinks the ${item.title} is theirs`,
      body: body.message,
      href: `/lost-found`,
      actor: actor.id,
      entityType: 'LostItem',
      entity: item._id,
    });
    return ok({ sent: true });
  }
  if (!mine && !actor.canModerate) throw ApiError.forbidden('Only the person who posted it can change this.');
  item.status = body.action === 'resolve' ? 'resolved' : 'open';
  await item.save();
  return ok({ status: item.status });
});
