import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import HubMember from '@/models/hub/HubMember';
import User from '@/models/User';
import { requireServer } from '@/server/modules/hub/access';
import { container } from '@/server/container';

const querySchema = z.object({ q: z.string().trim().max(60).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

/** Members, with presence, for the member list and @-mention autocomplete. */
export const GET = route({ query: querySchema, feature: 'hub' }, async ({ actor, params, query }) => {
  const { ctx } = await requireServer(actor.id, params.id);
  let userFilter: string[] | undefined;
  if (query.q) {
    const matches = await User.find({ campus: actor.campus, name: new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).select('_id').limit(200).lean();
    userFilter = matches.map((u) => String(u._id));
  }
  const members = await HubMember.find({ server: ctx.server._id, ...(userFilter ? { user: { $in: userFilter } } : {}) })
    .sort({ joinedAt: 1 })
    .limit(query.limit)
    .populate('user', 'name image role year batch')
    .lean();
  const online = await container().realtime.online(members.map((m) => String((m.user as unknown as { _id: unknown })._id)));
  return ok({
    members: members.map((m) => {
      const user = m.user as unknown as { _id: unknown; name: string; image?: string; role: string; year: number; batch: string };
      return {
        userId: String(user._id),
        name: user.name,
        image: user.image ?? '',
        role: user.role,
        batch: user.batch,
        nickname: m.nickname,
        roles: m.roles.map(String),
        timedOutUntil: m.timedOutUntil,
        online: online.has(String(user._id)),
      };
    }),
  });
});
