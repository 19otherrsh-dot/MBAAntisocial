import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { objectId } from '@/lib/validation';
import Team from '@/models/campus/Team';
import CaseComp from '@/models/CaseComp';
import User from '@/models/User';
import { createTeam, isMember } from '@/server/modules/campus-life/teams';

const querySchema = z.object({ scope: z.enum(['looking', 'mine']).default('looking'), comp: objectId.optional() });

export const GET = route({ feature: 'teams', query: querySchema }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { campus: actor.campus, archivedAt: { $exists: false } };
  if (query.scope === 'mine') filter['members.user'] = actor.id;
  else filter.lookingForMembers = true;
  if (query.comp) filter.comp = query.comp;
  const teams = await Team.find(filter).sort({ createdAt: -1 }).limit(60).lean();
  const [users, comps] = await Promise.all([
    User.find({ _id: { $in: teams.flatMap((t) => t.members.map((m) => m.user)) } }).select('name image batch specializations').lean(),
    CaseComp.find({ _id: { $in: teams.flatMap((t) => (t.comp ? [t.comp] : [])) } }).select('title deadline').lean(),
  ]);
  const person = new Map(users.map((u) => [String(u._id), u]));
  const compOf = new Map(comps.map((c) => [String(c._id), c]));
  return ok({
    teams: teams.map((t) => ({
      _id: String(t._id),
      name: t.name,
      purpose: t.purpose,
      comp: t.comp ? { _id: String(t.comp), title: compOf.get(String(t.comp))?.title ?? 'Competition' } : null,
      captain: String(t.captain),
      members: t.members.map((m) => ({ _id: String(m.user), name: person.get(String(m.user))?.name ?? 'Member', image: person.get(String(m.user))?.image ?? '', specializations: person.get(String(m.user))?.specializations ?? [] })),
      maxSize: t.maxSize,
      openRoles: t.openRoles,
      lookingForMembers: t.lookingForMembers,
      isMember: isMember(t, actor.id),
      requested: t.requests.some((r) => String(r.user) === actor.id),
      hubServer: isMember(t, actor.id) && t.hubServer ? String(t.hubServer) : null,
    })),
  });
});

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  purpose: z.string().trim().max(1000).default(''),
  comp: objectId.optional(),
  maxSize: z.number().int().min(2).max(12).default(4),
  openRoles: z.array(z.string().trim().min(2).max(40)).max(8).default([]),
});

export const POST = route({ feature: 'teams', body: schema, rateLimit: 'write' }, async ({ actor, body }) => {
  const team = await createTeam(actor, body);
  return created({ team: { _id: String(team._id) } });
});
