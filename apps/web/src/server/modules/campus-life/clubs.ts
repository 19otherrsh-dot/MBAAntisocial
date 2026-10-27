import { Types } from 'mongoose';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Club, { type IClub, type ClubRole } from '@/models/campus/Club';
import { addMember, createServer, removeMember } from '../hub/service';

export function memberOf(club: Pick<IClub, 'members'>, userId: string) {
  return club.members.find((m) => String(m.user) === userId) ?? null;
}

/** Leads and core members run the club; leads alone change roles. */
export function canManageClub(club: Pick<IClub, 'members'>, userId: string, need: ClubRole = 'core'): boolean {
  const m = memberOf(club, userId);
  if (!m) return false;
  return need === 'lead' ? m.role === 'lead' : m.role === 'lead' || m.role === 'core';
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'club';
}

export async function loadClub(slugOrId: string, campus: string) {
  const filter = Types.ObjectId.isValid(slugOrId) ? { _id: slugOrId, campus } : { slug: slugOrId.toLowerCase(), campus };
  const club = await Club.findOne({ ...filter, archivedAt: { $exists: false } });
  if (!club) throw ApiError.notFound('That club does not exist.');
  return club;
}

/** Creates the club, its hub server, and seats the creator as lead. */
export async function createClub(actor: Actor, input: { name: string; tagline: string; description: string; category: IClub['category'] }) {
  let slug = slugify(input.name);
  if (await Club.exists({ campus: actor.campus, slug })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const club = await Club.create({
    ...input,
    campus: actor.campus,
    slug,
    // The campus team's own clubs are official from the start.
    official: actor.canModerate || actor.canAdminCampus,
    members: [{ user: actor.id, role: 'lead', title: 'Founder', joinedAt: new Date() }],
    memberCount: 1,
  });
  try {
    const server = await createServer({ campus: actor.campus, ownerId: actor.id, name: input.name, kind: 'club', visibility: 'request', description: input.tagline, linkedEntity: { kind: 'club', id: club._id } });
    club.hubServer = server._id;
    await club.save();
  } catch (error) {
    console.error('[clubs] hub server creation failed:', error);
  }
  return club;
}

export async function addClubMember(club: InstanceType<typeof Club>, userId: string, role: ClubRole = 'member') {
  if (memberOf(club, userId)) return;
  await Club.updateOne({ _id: club._id, 'members.user': { $ne: new Types.ObjectId(userId) } }, { $push: { members: { user: userId, role, title: '', joinedAt: new Date() } }, $inc: { memberCount: 1 } });
  if (club.hubServer) await addMember(String(club.hubServer), userId).catch(() => undefined);
}

export async function removeClubMember(club: InstanceType<typeof Club>, userId: string) {
  const m = memberOf(club, userId);
  if (!m) return;
  if (m.role === 'lead' && club.members.filter((x) => x.role === 'lead').length === 1) {
    throw ApiError.badRequest('Hand the lead role to someone else first.');
  }
  await Club.updateOne({ _id: club._id }, { $pull: { members: { user: new Types.ObjectId(userId) } }, $inc: { memberCount: -1 } });
  if (club.hubServer) await removeMember(String(club.hubServer), userId).catch(() => undefined);
}
