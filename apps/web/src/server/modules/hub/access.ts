import type { Types } from 'mongoose';
import {
  computePermissions,
  hasPermission,
  MODERATOR_PRESET,
  type PermissionName,
  type RoleLike,
} from '@mba/shared/hub';
import { MODERATOR_ROLES, type UserRole } from '@/lib/constants';
import { ApiError } from '@/lib/api/errors';
import HubServer, { type IHubServer } from '@/models/hub/HubServer';
import HubRole, { type IHubRole } from '@/models/hub/HubRole';
import HubMember, { type IHubMember } from '@/models/hub/HubMember';
import HubChannel, { type IHubChannel } from '@/models/hub/HubChannel';
import HubConversation from '@/models/hub/HubConversation';
import User from '@/models/User';

/**
 * Permission resolution for the hub. Everything that asks "may this person do
 * X here?" — routes, the realtime authoriser, voice rooms — comes through this
 * file, which delegates the arithmetic to the shared, tested `computePermissions`.
 */

type Lean<T> = T & { _id: Types.ObjectId };

export interface ServerContext {
  server: Lean<IHubServer>;
  member: Lean<IHubMember> | null;
  everyone: RoleLike;
  memberRoles: RoleLike[];
  roles: Map<string, Lean<IHubRole>>;
  userId: string;
  isOwner: boolean;
  /** Campus moderators can moderate every server on their campus. */
  isCampusModerator: boolean;
  highestPosition: number;
}

function toRoleLike(role: Lean<IHubRole>): RoleLike {
  return { id: String(role._id), permissions: role.permissions, position: role.position };
}

export async function serverContext(userId: string, serverId: string): Promise<ServerContext | null> {
  if (!/^[a-f0-9]{24}$/.test(serverId)) return null;
  const [server, member, user] = await Promise.all([
    HubServer.findOne({ _id: serverId, archivedAt: { $exists: false } }).lean(),
    HubMember.findOne({ server: serverId, user: userId }).lean(),
    User.findById(userId).select('campus role').lean(),
  ]);
  if (!server || !user || user.campus !== server.campus) return null;

  const roles = await HubRole.find({ server: serverId }).lean();
  const roleMap = new Map(roles.map((r) => [String(r._id), r]));
  const everyoneDoc = roles.find((r) => r.isEveryone);
  const everyone: RoleLike = everyoneDoc ? toRoleLike(everyoneDoc) : { id: 'everyone', permissions: 0, position: 0 };
  const memberRoles: Array<Lean<IHubRole>> = [];
  for (const id of member?.roles ?? []) {
    const role = roleMap.get(String(id));
    if (role) memberRoles.push(role);
  }

  return {
    server,
    member,
    everyone,
    memberRoles: memberRoles.map(toRoleLike),
    roles: roleMap,
    userId,
    isOwner: String(server.owner ?? '') === userId,
    isCampusModerator: MODERATOR_ROLES.includes(user.role as UserRole),
    highestPosition: Math.max(0, ...memberRoles.map((r) => r.position)),
  };
}

/** Server-level permissions (no channel overwrites). */
export function serverPerms(ctx: ServerContext): number {
  if (!ctx.member && !ctx.isCampusModerator) return 0;
  let perms = computePermissions({
    userId: ctx.userId,
    ownerId: String(ctx.server.owner ?? ''),
    everyone: ctx.everyone,
    memberRoles: ctx.memberRoles,
    timedOutUntil: ctx.member?.timedOutUntil ?? null,
  });
  if (ctx.isCampusModerator) perms |= MODERATOR_PRESET;
  return perms;
}

export function channelPerms(ctx: ServerContext, channel: Pick<IHubChannel, 'overwrites'>): number {
  if (!ctx.member && !ctx.isCampusModerator) return 0;
  let perms = computePermissions({
    userId: ctx.userId,
    ownerId: String(ctx.server.owner ?? ''),
    everyone: ctx.everyone,
    memberRoles: ctx.memberRoles,
    overwrites: channel.overwrites.map((o) => ({
      target: String(o.target),
      kind: o.kind,
      allow: o.allow,
      deny: o.deny,
    })),
    timedOutUntil: ctx.member?.timedOutUntil ?? null,
  });
  if (ctx.isCampusModerator) perms |= MODERATOR_PRESET;
  return perms;
}

export interface ChannelContext {
  ctx: ServerContext;
  channel: Lean<IHubChannel>;
  perms: number;
}

export async function channelContext(userId: string, channelId: string): Promise<ChannelContext | null> {
  if (!/^[a-f0-9]{24}$/.test(channelId)) return null;
  const channel = await HubChannel.findOne({ _id: channelId, archivedAt: { $exists: false } }).lean();
  if (!channel) return null;
  const ctx = await serverContext(userId, String(channel.server));
  if (!ctx) return null;
  return { ctx, channel, perms: channelPerms(ctx, channel) };
}

/** Throws a 404 (never 403) so channel and server ids cannot be probed. */
export async function requireChannel(userId: string, channelId: string, need: PermissionName = 'VIEW_CHANNEL') {
  const result = await channelContext(userId, channelId);
  if (!result || !hasPermission(result.perms, 'VIEW_CHANNEL')) throw ApiError.notFound('That channel does not exist.');
  if (!hasPermission(result.perms, need)) throw ApiError.forbidden(permissionMessage(need));
  return result;
}

export async function requireServer(userId: string, serverId: string, need?: PermissionName) {
  const ctx = await serverContext(userId, serverId);
  if (!ctx || (!ctx.member && !ctx.isCampusModerator)) throw ApiError.notFound('That server does not exist.');
  const perms = serverPerms(ctx);
  if (need && !hasPermission(perms, need)) throw ApiError.forbidden(permissionMessage(need));
  return { ctx, perms };
}

function permissionMessage(need: PermissionName): string {
  const copy: Partial<Record<PermissionName, string>> = {
    SEND_MESSAGES: 'You can read this channel but not post in it.',
    ATTACH_FILES: 'Attachments are turned off for you here.',
    ADD_REACTIONS: 'Reactions are turned off for you here.',
    MANAGE_MESSAGES: 'Only moderators can do that.',
    MANAGE_CHANNELS: 'Only server managers can change channels.',
    MANAGE_ROLES: 'Only server managers can change roles.',
    MANAGE_SERVER: 'Only server managers can change settings.',
    CONNECT_VOICE: 'You cannot join voice here.',
  };
  return copy[need] ?? 'You do not have permission to do that.';
}

/* ───────────────────────── Realtime authorisers ───────────────────────── */

export async function canSubscribeServer(userId: string, serverId: string): Promise<boolean> {
  const ctx = await serverContext(userId, serverId);
  return Boolean(ctx && (ctx.member || ctx.isCampusModerator));
}

export async function canSubscribeChannel(userId: string, channelId: string): Promise<boolean> {
  const result = await channelContext(userId, channelId);
  return Boolean(result && hasPermission(result.perms, 'VIEW_CHANNEL'));
}

export async function canSubscribeConversation(userId: string, conversationId: string): Promise<boolean> {
  if (!/^[a-f0-9]{24}$/.test(conversationId)) return false;
  return Boolean(await HubConversation.exists({ _id: conversationId, participants: userId }));
}
