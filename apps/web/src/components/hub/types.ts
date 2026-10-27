export interface HubServerSummary {
  _id: string;
  name: string;
  kind: 'campus' | 'club' | 'circle' | 'course' | 'team' | 'custom';
  color: string;
  icon: string;
  memberCount: number;
  visibility: 'public' | 'request' | 'invite';
  description: string;
}

export interface HubRoleInfo {
  _id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
  hoist: boolean;
  mentionable: boolean;
  isEveryone: boolean;
  managedBy: string;
}

export interface HubChannelInfo {
  _id: string;
  name: string;
  kind: 'text' | 'announcement' | 'voice' | 'forum';
  topic: string;
  category: string;
  position: number;
  slowModeSeconds: number;
  lastMessageAt?: string;
  unread: boolean;
  canSend: boolean;
  overwrites?: Array<{ target: string; kind: 'role' | 'member'; allow: number; deny: number }>;
  discord?: { direction: 'out' | 'in' | 'both'; channelId: string; hasWebhook: boolean };
}

export interface HubServerDetail {
  server: HubServerSummary & { owner?: string; discordGuildId: string };
  member: { roles: string[]; nickname: string; notify: 'all' | 'mentions' | 'none'; timedOutUntil?: string } | null;
  permissions: number;
  permissionNames: string[];
  isOwner: boolean;
  roles: HubRoleInfo[];
  channels: HubChannelInfo[];
  discordBotInviteUrl: string | null;
}

export interface HubAuthor {
  _id: string;
  name: string;
  image?: string;
  role?: string;
  year?: number;
}

export interface HubMessageView {
  _id: string;
  channel?: string;
  conversation?: string;
  author?: HubAuthor | null;
  content: string;
  attachments: Array<{ url: string; name: string; mime: string; bytes: number }>;
  mentions: { users: string[]; roles: string[]; everyone: boolean };
  replyTo?: string;
  thread?: string;
  threadCount: number;
  lastThreadAt?: string;
  title: string;
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
  pinned: boolean;
  edited: boolean;
  deleted: boolean;
  hidden: boolean;
  system: boolean;
  viaDiscord?: { authorName: string; authorAvatar: string };
  markedUseful: boolean;
  createdAt: string;
  /** Client-only: optimistic message not yet confirmed. */
  pending?: boolean;
}

export interface HubMemberView {
  userId: string;
  name: string;
  image: string;
  role: string;
  batch: string;
  nickname: string;
  roles: string[];
  online: boolean;
  timedOutUntil?: string;
}

export interface ConversationSummary {
  _id: string;
  kind: 'dm' | 'group';
  name: string;
  participants: HubAuthor[];
  lastMessageAt?: string;
  lastMessagePreview: string;
  unread: boolean;
}
