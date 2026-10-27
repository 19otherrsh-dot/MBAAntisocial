/**
 * The community hub's permission model.
 *
 * Shaped after Discord's because the people using this already know it: a
 * server has roles, each role carries a permission bitset, and a channel can
 * override what a role (or one member) may do there. Kept as pure functions so
 * the web API, the realtime server, and the native app all compute the same
 * answer from the same inputs.
 */

export const PERMISSIONS = {
  VIEW_CHANNEL: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  ADD_REACTIONS: 1 << 2,
  ATTACH_FILES: 1 << 3,
  CREATE_THREADS: 1 << 4,
  MENTION_EVERYONE: 1 << 5,
  CONNECT_VOICE: 1 << 6,
  SPEAK: 1 << 7,
  VIDEO: 1 << 8,
  CREATE_INVITE: 1 << 9,
  PIN_MESSAGES: 1 << 10,
  MANAGE_MESSAGES: 1 << 11,
  MANAGE_THREADS: 1 << 12,
  MODERATE_MEMBERS: 1 << 13,
  KICK_MEMBERS: 1 << 14,
  BAN_MEMBERS: 1 << 15,
  MANAGE_CHANNELS: 1 << 16,
  MANAGE_ROLES: 1 << 17,
  MANAGE_SERVER: 1 << 18,
  MANAGE_EVENTS: 1 << 19,
  ADMINISTRATOR: 1 << 20,
} as const;

export type PermissionName = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((acc, bit) => acc | bit, 0);

export const PERMISSION_META: Record<PermissionName, { label: string; help: string; group: string }> = {
  VIEW_CHANNEL: { label: 'View channels', help: 'See the channel and read its history.', group: 'General' },
  SEND_MESSAGES: { label: 'Send messages', help: 'Post in text channels and threads.', group: 'Text' },
  ADD_REACTIONS: { label: 'Add reactions', help: 'React to messages.', group: 'Text' },
  ATTACH_FILES: { label: 'Attach files', help: 'Upload images and documents.', group: 'Text' },
  CREATE_THREADS: { label: 'Create threads', help: 'Start a thread off a message.', group: 'Text' },
  MENTION_EVERYONE: { label: 'Mention @everyone', help: 'Ping every member of the server.', group: 'Text' },
  CONNECT_VOICE: { label: 'Join voice', help: 'Join voice and video rooms.', group: 'Voice' },
  SPEAK: { label: 'Speak', help: 'Unmute in voice rooms.', group: 'Voice' },
  VIDEO: { label: 'Video', help: 'Turn on camera or share screen.', group: 'Voice' },
  CREATE_INVITE: { label: 'Create invites', help: 'Invite people from campus.', group: 'General' },
  PIN_MESSAGES: { label: 'Pin messages', help: 'Pin and unpin messages.', group: 'Text' },
  MANAGE_MESSAGES: { label: 'Manage messages', help: 'Delete or hide anyone’s messages.', group: 'Moderation' },
  MANAGE_THREADS: { label: 'Manage threads', help: 'Archive, lock, or delete threads.', group: 'Moderation' },
  MODERATE_MEMBERS: { label: 'Time out members', help: 'Temporarily mute a member.', group: 'Moderation' },
  KICK_MEMBERS: { label: 'Remove members', help: 'Remove a member from the server.', group: 'Moderation' },
  BAN_MEMBERS: { label: 'Ban members', help: 'Ban a member from rejoining.', group: 'Moderation' },
  MANAGE_CHANNELS: { label: 'Manage channels', help: 'Create, edit, and delete channels.', group: 'Admin' },
  MANAGE_ROLES: { label: 'Manage roles', help: 'Create roles below your own and assign them.', group: 'Admin' },
  MANAGE_SERVER: { label: 'Manage server', help: 'Rename the server and change settings.', group: 'Admin' },
  MANAGE_EVENTS: { label: 'Manage events', help: 'Schedule server events.', group: 'Admin' },
  ADMINISTRATOR: { label: 'Administrator', help: 'Every permission, everywhere. Grant sparingly.', group: 'Admin' },
};

/** What `@everyone` can do in a freshly created server. */
export const DEFAULT_EVERYONE_PERMISSIONS =
  PERMISSIONS.VIEW_CHANNEL |
  PERMISSIONS.SEND_MESSAGES |
  PERMISSIONS.ADD_REACTIONS |
  PERMISSIONS.ATTACH_FILES |
  PERMISSIONS.CREATE_THREADS |
  PERMISSIONS.CONNECT_VOICE |
  PERMISSIONS.SPEAK |
  PERMISSIONS.VIDEO |
  PERMISSIONS.CREATE_INVITE;

export const MODERATOR_PRESET =
  DEFAULT_EVERYONE_PERMISSIONS |
  PERMISSIONS.PIN_MESSAGES |
  PERMISSIONS.MANAGE_MESSAGES |
  PERMISSIONS.MANAGE_THREADS |
  PERMISSIONS.MODERATE_MEMBERS |
  PERMISSIONS.KICK_MEMBERS |
  PERMISSIONS.MENTION_EVERYONE;

export const SERVER_KINDS = ['campus', 'club', 'circle', 'course', 'team', 'custom'] as const;
export type ServerKind = (typeof SERVER_KINDS)[number];

export const SERVER_KIND_META: Record<ServerKind, { label: string; blurb: string }> = {
  campus: { label: 'Campus', blurb: 'Everyone at your institute. Created automatically.' },
  club: { label: 'Club', blurb: 'A club or committee, run by its leads.' },
  circle: { label: 'Circle', blurb: 'An interest group — sports, startups, an elective.' },
  course: { label: 'Course', blurb: 'One course section and its study groups.' },
  team: { label: 'Team', blurb: 'A case-comp or project team.' },
  custom: { label: 'Custom', blurb: 'Anything else.' },
};

export const SERVER_VISIBILITIES = ['public', 'request', 'invite'] as const;
export type ServerVisibility = (typeof SERVER_VISIBILITIES)[number];

export const CHANNEL_KINDS = ['text', 'announcement', 'voice', 'forum'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const CHANNEL_KIND_META: Record<ChannelKind, { label: string; blurb: string }> = {
  text: { label: 'Text', blurb: 'Chat, links, files, threads.' },
  announcement: { label: 'Announcements', blurb: 'Only managers post; everyone reads. Can mirror to Discord.' },
  voice: { label: 'Voice & video', blurb: 'Drop-in audio, camera, and screen share.' },
  forum: { label: 'Forum', blurb: 'Every post is its own thread — good for Q&A.' },
};

export interface RoleLike {
  id: string;
  permissions: number;
  position: number;
}

export interface OverwriteLike {
  /** A role id, or a member's user id. */
  target: string;
  kind: 'role' | 'member';
  allow: number;
  deny: number;
}

export interface PermissionInput {
  userId: string;
  ownerId: string;
  /** The server's `@everyone` role. */
  everyone: RoleLike;
  /** Roles the member holds, excluding `@everyone`. */
  memberRoles: RoleLike[];
  /** Channel-level overwrites, if computing for a channel. */
  overwrites?: OverwriteLike[];
  /** A member under an active timeout can read but not participate. */
  timedOutUntil?: Date | null;
  now?: Date;
}

const TIMEOUT_REVOKES =
  PERMISSIONS.SEND_MESSAGES |
  PERMISSIONS.ADD_REACTIONS |
  PERMISSIONS.ATTACH_FILES |
  PERMISSIONS.CREATE_THREADS |
  PERMISSIONS.SPEAK |
  PERMISSIONS.VIDEO |
  PERMISSIONS.MENTION_EVERYONE;

/**
 * Effective permissions, applied in Discord's order:
 * base (everyone ∪ roles) → administrator short-circuit → @everyone channel
 * overwrite → union of role overwrites → member overwrite → timeout.
 */
export function computePermissions(input: PermissionInput): number {
  if (input.userId === input.ownerId) return ALL_PERMISSIONS;

  let base = input.everyone.permissions;
  for (const role of input.memberRoles) base |= role.permissions;

  if (base & PERMISSIONS.ADMINISTRATOR) return ALL_PERMISSIONS;

  let perms = base;
  const overwrites = input.overwrites ?? [];

  const everyoneOverwrite = overwrites.find((o) => o.kind === 'role' && o.target === input.everyone.id);
  if (everyoneOverwrite) {
    perms &= ~everyoneOverwrite.deny;
    perms |= everyoneOverwrite.allow;
  }

  const roleIds = new Set(input.memberRoles.map((r) => r.id));
  let roleAllow = 0;
  let roleDeny = 0;
  for (const o of overwrites) {
    if (o.kind === 'role' && roleIds.has(o.target)) {
      roleAllow |= o.allow;
      roleDeny |= o.deny;
    }
  }
  perms &= ~roleDeny;
  perms |= roleAllow;

  const memberOverwrite = overwrites.find((o) => o.kind === 'member' && o.target === input.userId);
  if (memberOverwrite) {
    perms &= ~memberOverwrite.deny;
    perms |= memberOverwrite.allow;
  }

  const now = input.now ?? new Date();
  if (input.timedOutUntil && input.timedOutUntil > now) perms &= ~TIMEOUT_REVOKES;

  // Without sight of a channel, nothing else in it is meaningful.
  if (!(perms & PERMISSIONS.VIEW_CHANNEL)) return 0;

  return perms;
}

export function hasPermission(perms: number, name: PermissionName): boolean {
  if (perms & PERMISSIONS.ADMINISTRATOR) return true;
  return (perms & PERMISSIONS[name]) === PERMISSIONS[name];
}

export function permissionNames(perms: number): PermissionName[] {
  return (Object.keys(PERMISSIONS) as PermissionName[]).filter((name) => perms & PERMISSIONS[name]);
}

/**
 * A member may only manage a role strictly below their own highest role, so a
 * moderator cannot promote themselves to admin or demote the person above them.
 */
export function canManageRole(actorHighestPosition: number, targetPosition: number, actorIsOwner: boolean) {
  return actorIsOwner || actorHighestPosition > targetPosition;
}

/* ───────────────────────── Mentions ───────────────────────── */

export interface ParsedMentions {
  users: string[];
  roles: string[];
  everyone: boolean;
  channels: string[];
}

const USER_MENTION = /<@([a-f0-9]{24})>/g;
const ROLE_MENTION = /<@&([a-f0-9]{24})>/g;
const CHANNEL_MENTION = /<#([a-f0-9]{24})>/g;

/**
 * Mentions are stored in a token form (`<@userId>`), so renaming someone never
 * breaks an old message and the server never has to guess who "@Priya" was.
 */
export function parseMentions(content: string): ParsedMentions {
  const unique = (re: RegExp) => [...new Set([...content.matchAll(re)].map((m) => m[1]))];
  return {
    users: unique(USER_MENTION),
    roles: unique(ROLE_MENTION),
    channels: unique(CHANNEL_MENTION),
    everyone: /(^|\s)@(everyone|here)\b/.test(content),
  };
}

export const MAX_HUB_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;
/** Seconds between messages a member may send when slow mode is on. */
export const SLOW_MODE_OPTIONS = [0, 5, 10, 30, 60, 300, 900] as const;

/** Reaction palette. Free-form emoji, but these sit in the quick bar. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎯', '👀', '🙏', '✅'] as const;
