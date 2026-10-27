import { Types } from 'mongoose';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Team from '@/models/campus/Team';
import { addMember, createServer, removeMember } from '../hub/service';

export async function loadTeam(id: string, campus: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('That team does not exist.');
  const team = await Team.findOne({ _id: id, campus, archivedAt: { $exists: false } });
  if (!team) throw ApiError.notFound('That team does not exist.');
  return team;
}

export const isMember = (team: { members: Array<{ user: Types.ObjectId }> }, userId: string) => team.members.some((m) => String(m.user) === userId);

export async function createTeam(actor: Actor, input: { name: string; purpose: string; comp?: string; maxSize: number; openRoles: string[] }) {
  const team = await Team.create({ ...input, campus: actor.campus, captain: actor.id, members: [{ user: actor.id, joinedAt: new Date() }] });
  try {
    const server = await createServer({ campus: actor.campus, ownerId: actor.id, name: input.name, kind: 'team', visibility: 'invite', description: input.purpose.slice(0, 140), linkedEntity: { kind: 'team', id: team._id } });
    team.hubServer = server._id;
    await team.save();
  } catch (error) {
    console.error('[teams] hub server creation failed:', error);
  }
  return team;
}

export async function addTeamMember(team: InstanceType<typeof Team>, userId: string) {
  if (isMember(team, userId)) return;
  if (team.members.length >= team.maxSize) throw ApiError.conflict('The team is full.');
  await Team.updateOne(
    { _id: team._id },
    { $push: { members: { user: userId, joinedAt: new Date() } }, $pull: { requests: { user: new Types.ObjectId(userId) } }, ...(team.members.length + 1 >= team.maxSize ? { $set: { lookingForMembers: false } } : {}) }
  );
  if (team.hubServer) await addMember(String(team.hubServer), userId).catch(() => undefined);
}

export async function removeTeamMember(team: InstanceType<typeof Team>, userId: string) {
  if (String(team.captain) === userId) throw ApiError.badRequest('Make someone else captain before leaving.');
  await Team.updateOne({ _id: team._id }, { $pull: { members: { user: new Types.ObjectId(userId) } } });
  if (team.hubServer) await removeMember(String(team.hubServer), userId).catch(() => undefined);
}
