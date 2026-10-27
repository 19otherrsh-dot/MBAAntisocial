import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import HubServer from '@/models/hub/HubServer';
import HubMember from '@/models/hub/HubMember';
import HubJoinRequest from '@/models/hub/HubJoinRequest';

const querySchema = z.object({ q: z.string().trim().max(60).optional(), kind: z.enum(['club', 'circle', 'course', 'team', 'custom']).optional() });

/** Discoverable servers on campus: public and request-to-join ones. Invite-only servers never appear. */
export const GET = route({ query: querySchema, feature: 'hub' }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { campus: actor.campus, archivedAt: { $exists: false }, kind: { $ne: 'campus' }, visibility: { $in: ['public', 'request'] } };
  if (query.kind) filter.kind = query.kind;
  if (query.q) filter.name = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [servers, mine, requested] = await Promise.all([
    HubServer.find(filter).sort({ memberCount: -1 }).limit(60).lean(),
    HubMember.find({ user: actor.id }).select('server').lean(),
    HubJoinRequest.find({ user: actor.id }).select('server').lean(),
  ]);
  const joined = new Set(mine.map((m) => String(m.server)));
  const pending = new Set(requested.map((r) => String(r.server)));
  return ok({
    servers: servers.map((s) => ({ ...s, _id: String(s._id), joined: joined.has(String(s._id)), requested: pending.has(String(s._id)) })),
  });
});
