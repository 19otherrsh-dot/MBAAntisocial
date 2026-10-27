import type { Types } from 'mongoose';
import {
  DEFAULT_EVERYONE_PERMISSIONS,
  MODERATOR_PRESET,
  PERMISSIONS,
  type ChannelKind,
  type ServerKind,
  type ServerVisibility,
} from '@mba/shared/hub';
import { topics } from '@mba/shared/realtime';
import { MENTOR_ROLES, MODERATOR_ROLES, type UserRole } from '@/lib/constants';
import { ApiError } from '@/lib/api/errors';
import HubServer from '@/models/hub/HubServer';
import HubRole from '@/models/hub/HubRole';
import HubMember from '@/models/hub/HubMember';
import HubChannel from '@/models/hub/HubChannel';
import HubMessage from '@/models/hub/HubMessage';
import HubBan from '@/models/hub/HubBan';
import User from '@/models/User';
import { container } from '../../container';

/**
 * Servers, channels, roles, and membership. Messages live in `messages.ts`
 * and direct messages in `dm.ts`.
 */

interface ChannelSeed {
  name: string;
  kind: ChannelKind;
  category: string;
  topic?: string;
  /** Only managers post; everyone reads. */
  readOnly?: boolean;
}

const CAMPUS_CHANNELS: ChannelSeed[] = [
  { name: 'announcements', kind: 'announcement', category: 'Start here', topic: 'Official updates from the campus team.', readOnly: true },
  { name: 'welcome', kind: 'text', category: 'Start here', topic: 'Say hello. Batch, specialisation, one fun fact.' },
  { name: 'general', kind: 'text', category: 'Campus', topic: 'Anything campus.' },
  { name: 'placements', kind: 'text', category: 'Campus', topic: 'Processes, shortlists, prep chatter.' },
  { name: 'academics', kind: 'text', category: 'Campus', topic: 'Courses, exams, assignments (no gradable work).' },
  { name: 'ask-seniors', kind: 'forum', category: 'Campus', topic: 'One question per post. Seniors answer, the best answer gets marked.' },
  { name: 'memes', kind: 'text', category: 'Campus', topic: 'The antisocial side of campus.' },
  { name: 'study-room', kind: 'voice', category: 'Voice', topic: 'Drop in, mute, grind.' },
  { name: 'lounge', kind: 'voice', category: 'Voice', topic: 'Hang out.' },
];

const DEFAULT_CHANNELS: ChannelSeed[] = [
  { name: 'announcements', kind: 'announcement', category: '', readOnly: true },
  { name: 'general', kind: 'text', category: '' },
  { name: 'lounge', kind: 'voice', category: 'Voice' },
];

const TEAM_CHANNELS: ChannelSeed[] = [
  { name: 'general', kind: 'text', category: '' },
  { name: 'research', kind: 'text', category: '' },
  { name: 'deck', kind: 'text', category: '', topic: 'Drafts and feedback.' },
  { name: 'war-room', kind: 'voice', category: 'Voice' },
];

const KIND_COLOR: Record<ServerKind, string> = {
  campus: '#5b4bdb',
  club: '#d9480f',
  circle: '#0c8599',
  course: '#2b8a3e',
  team: '#c2255c',
  custom: '#495057',
};

export interface CreateServerInput {
  campus: string;
  ownerId?: string;
  name: string;
  kind: ServerKind;
  visibility: ServerVisibility;
  description?: string;
  color?: string;
  linkedEntity?: { kind: 'club' | 'team' | 'course'; id: Types.ObjectId | string };
}

async function seedChannels(serverId: Types.ObjectId, everyoneRoleId: Types.ObjectId, seeds: ChannelSeed[]) {
  await HubChannel.insertMany(
    seeds.map((seed, position) => ({
      server: serverId,
      name: seed.name,
      kind: seed.kind,
      category: seed.category,
      topic: seed.topic ?? '',
      position,
      overwrites: seed.readOnly
        ? [{ target: everyoneRoleId, kind: 'role', allow: 0, deny: PERMISSIONS.SEND_MESSAGES | PERMISSIONS.CREATE_THREADS }]
        : [],
    }))
  );
}

export async function createServer(input: CreateServerInput) {
  const server = await HubServer.create({
    campus: input.campus,
    name: input.name,
    kind: input.kind,
    visibility: input.visibility,
    description: input.description ?? '',
    color: input.color ?? KIND_COLOR[input.kind],
    owner: input.ownerId,
    linkedEntity: input.linkedEntity,
  });

  const [everyone] = await HubRole.insertMany([
    { server: server._id, name: '@everyone', permissions: DEFAULT_EVERYONE_PERMISSIONS, position: 0, isEveryone: true },
    { server: server._id, name: 'Moderators', color: '#2f9e44', permissions: MODERATOR_PRESET, position: 10, hoist: true, mentionable: true, managedBy: input.kind === 'campus' ? 'campus_moderators' : '' },
    ...(input.kind === 'campus'
      ? [{ server: server._id, name: 'Seniors & alumni', color: '#7048e8', permissions: DEFAULT_EVERYONE_PERMISSIONS, position: 5, hoist: true, mentionable: true, managedBy: 'seniors' }]
      : [{ server: server._id, name: 'Leads', color: '#e8590c', permissions: MODERATOR_PRESET | PERMISSIONS.MANAGE_CHANNELS | PERMISSIONS.MANAGE_EVENTS, position: 20, hoist: true, mentionable: true }]),
  ]);
  server.everyoneRole = everyone._id;
  await server.save();

  await seedChannels(
    server._id,
    everyone._id,
    input.kind === 'campus' ? CAMPUS_CHANNELS : input.kind === 'team' ? TEAM_CHANNELS : DEFAULT_CHANNELS
  );

  if (input.ownerId) await addMember(String(server._id), input.ownerId, { silent: true });
  return server;
}

/** The campus server, created on first use. Safe under concurrent first visits. */
export async function ensureCampusServer(campus: string) {
  const existing = await HubServer.findOne({ campus, kind: 'campus' });
  if (existing) return existing;
  try {
    return await createServer({ campus, name: campus, kind: 'campus', visibility: 'public', description: `Everyone at ${campus}.` });
  } catch (error) {
    // Lost the race to another request — the unique index guarantees one server.
    if ((error as { code?: number }).code === 11000) return (await HubServer.findOne({ campus, kind: 'campus' }))!;
    throw error;
  }
}

/** Roles a member gets automatically from their platform role. */
async function managedRolesFor(serverId: string, userId: string): Promise<Types.ObjectId[]> {
  const [user, managed] = await Promise.all([
    User.findById(userId).select('role').lean(),
    HubRole.find({ server: serverId, managedBy: { $ne: '' } }).select('managedBy').lean(),
  ]);
  if (!user) return [];
  return managed
    .filter(
      (r) =>
        (r.managedBy === 'campus_moderators' && MODERATOR_ROLES.includes(user.role as UserRole)) ||
        (r.managedBy === 'seniors' && MENTOR_ROLES.includes(user.role as UserRole))
    )
    .map((r) => r._id);
}

export async function addMember(serverId: string, userId: string, options: { silent?: boolean } = {}) {
  if (await HubBan.exists({ server: serverId, user: userId })) throw ApiError.forbidden('You were removed from this server.');
  const roles = await managedRolesFor(serverId, userId);
  const result = await HubMember.updateOne(
    { server: serverId, user: userId },
    { $setOnInsert: { joinedAt: new Date() }, $addToSet: { roles: { $each: roles } } },
    { upsert: true }
  );
  if (result.upsertedCount > 0) {
    await HubServer.updateOne({ _id: serverId }, { $inc: { memberCount: 1 } });
    if (!options.silent) await announceJoin(serverId, userId);
  }
  return result.upsertedCount > 0;
}

async function announceJoin(serverId: string, userId: string) {
  const welcome =
    (await HubChannel.findOne({ server: serverId, name: 'welcome', archivedAt: { $exists: false } }).select('_id').lean()) ??
    (await HubChannel.findOne({ server: serverId, kind: 'text', archivedAt: { $exists: false } }).sort({ position: 1 }).select('_id').lean());
  if (!welcome) return;
  const message = await HubMessage.create({ channel: welcome._id, server: serverId, author: userId, system: true, content: 'joined the server.' });
  await container().realtime.publish(topics.hubChannel(String(welcome._id)), 'hub.message.created', {
    channelId: String(welcome._id),
    message: { ...message.toObject(), _id: String(message._id) },
  });
}

export async function removeMember(serverId: string, userId: string) {
  const result = await HubMember.deleteOne({ server: serverId, user: userId });
  if (result.deletedCount > 0) await HubServer.updateOne({ _id: serverId }, { $inc: { memberCount: -1 } });
}

/** Joins the campus server on first hub visit, then returns the caller's servers. */
export async function serversForUser(userId: string, campus: string) {
  const campusServer = await ensureCampusServer(campus);
  await addMember(String(campusServer._id), userId, { silent: true }).catch(() => false);
  const memberships = await HubMember.find({ user: userId }).select('server').lean();
  const servers = await HubServer.find({ _id: { $in: memberships.map((m) => m.server) }, campus, archivedAt: { $exists: false } })
    .sort({ kind: 1, name: 1 })
    .lean();
  // Campus server first, then by name.
  return servers.sort((a, b) => (a.kind === 'campus' ? -1 : b.kind === 'campus' ? 1 : a.name.localeCompare(b.name)));
}

export function normaliseChannelName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
