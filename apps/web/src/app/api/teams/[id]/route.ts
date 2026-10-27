import { z } from 'zod';
import { Types } from 'mongoose';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { notify } from '@/lib/notifications';
import Team from '@/models/campus/Team';
import User from '@/models/User';
import { addTeamMember, isMember, loadTeam, removeTeamMember } from '@/server/modules/campus-life/teams';

export const GET = route({ feature: 'teams' }, async ({ actor, params }) => {
  const team = await loadTeam(params.id, actor.campus);
  const captain = String(team.captain) === actor.id;
  const users = await User.find({ _id: { $in: [...team.members.map((m) => m.user), ...team.requests.map((r) => r.user)] } }).select('name image batch specializations').lean();
  const person = new Map(users.map((u) => [String(u._id), u]));
  return ok({
    team: {
      _id: String(team._id),
      name: team.name,
      purpose: team.purpose,
      captain: String(team.captain),
      maxSize: team.maxSize,
      openRoles: team.openRoles,
      lookingForMembers: team.lookingForMembers,
      members: team.members.map((m) => ({ _id: String(m.user), name: person.get(String(m.user))?.name ?? 'Member', image: person.get(String(m.user))?.image ?? '', batch: person.get(String(m.user))?.batch ?? '' })),
      requests: captain ? team.requests.map((r) => ({ _id: String(r.user), name: person.get(String(r.user))?.name ?? 'Someone', specializations: person.get(String(r.user))?.specializations ?? [], note: r.note, at: r.at })) : [],
      hubServer: isMember(team, actor.id) && team.hubServer ? String(team.hubServer) : null,
    },
    me: { member: isMember(team, actor.id), captain, requested: team.requests.some((r) => String(r.user) === actor.id) },
  });
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), note: z.string().trim().max(500).default('') }),
  z.object({ action: z.literal('withdraw') }),
  z.object({ action: z.literal('accept'), userId: objectId }),
  z.object({ action: z.literal('decline'), userId: objectId }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('remove'), userId: objectId }),
  z.object({ action: z.literal('captain'), userId: objectId }),
  z.object({ action: z.literal('update'), purpose: z.string().trim().max(1000).optional(), openRoles: z.array(z.string().trim().min(2).max(40)).max(8).optional(), lookingForMembers: z.boolean().optional(), maxSize: z.number().int().min(2).max(12).optional() }),
  z.object({ action: z.literal('archive') }),
]);

export const POST = route({ feature: 'teams', body: schema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  const team = await loadTeam(params.id, actor.campus);
  const captainOnly = () => {
    if (String(team.captain) !== actor.id) throw ApiError.forbidden('Only the captain can do that.');
  };
  switch (body.action) {
    case 'request':
      if (isMember(team, actor.id)) throw ApiError.conflict('You are already on this team.');
      if (!team.lookingForMembers) throw ApiError.conflict('This team is not looking for members.');
      await Team.updateOne({ _id: team._id, 'requests.user': { $ne: new Types.ObjectId(actor.id) } }, { $push: { requests: { user: actor.id, note: body.note, at: new Date() } } });
      await notify({ user: team.captain, kind: 'team_invite', title: `${actor.name} wants to join ${team.name}`, body: body.note || undefined, href: `/teams?team=${team._id}`, actor: actor.id, entityType: 'Team', entity: team._id });
      break;
    case 'withdraw':
      await Team.updateOne({ _id: team._id }, { $pull: { requests: { user: new Types.ObjectId(actor.id) } } });
      break;
    case 'accept':
      captainOnly();
      if (!team.requests.some((r) => String(r.user) === body.userId)) throw ApiError.notFound('No request from them.');
      await addTeamMember(team, body.userId);
      await notify({ user: body.userId, kind: 'team_update', title: `You’re on ${team.name}!`, body: 'The team workspace is open in the hub.', href: `/teams?team=${team._id}`, actor: actor.id });
      break;
    case 'decline':
      captainOnly();
      await Team.updateOne({ _id: team._id }, { $pull: { requests: { user: new Types.ObjectId(body.userId) } } });
      break;
    case 'leave':
      await removeTeamMember(team, actor.id);
      break;
    case 'remove':
      captainOnly();
      await removeTeamMember(team, body.userId);
      break;
    case 'captain':
      captainOnly();
      if (!isMember(team, body.userId)) throw ApiError.notFound('They are not on the team.');
      await Team.updateOne({ _id: team._id }, { $set: { captain: body.userId } });
      break;
    case 'update': {
      captainOnly();
      const { action: _action, ...changes } = body;
      if (changes.maxSize && changes.maxSize < team.members.length) throw ApiError.unprocessable('The team already has more members than that.');
      await Team.updateOne({ _id: team._id }, { $set: changes });
      break;
    }
    case 'archive':
      captainOnly();
      await Team.updateOne({ _id: team._id }, { $set: { archivedAt: new Date(), lookingForMembers: false } });
      break;
  }
  return ok({ ok: true });
});
