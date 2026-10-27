import { z } from 'zod';
import {
  CHANNEL_KINDS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_HUB_MESSAGE_LENGTH,
  SERVER_VISIBILITIES,
  SLOW_MODE_OPTIONS,
} from '@mba/shared/hub';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id.');

export const createServerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(400).default(''),
  kind: z.enum(['circle', 'course', 'custom']),
  visibility: z.enum(SERVER_VISIBILITIES).default('public'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

export const updateServerSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(400).optional(),
  visibility: z.enum(SERVER_VISIBILITIES).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  icon: z.string().url().max(500).or(z.literal('')).optional(),
});

export const membershipSchema = z.object({
  action: z.enum(['join', 'leave', 'request']),
  note: z.string().trim().max(300).default(''),
  notify: z.enum(['all', 'mentions', 'none']).optional(),
});

export const memberActionSchema = z.object({
  roles: z.array(objectId).max(20).optional(),
  nickname: z.string().trim().max(40).optional(),
  timeoutMinutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
  action: z.enum(['kick', 'ban', 'unban']).optional(),
  reason: z.string().trim().max(300).default(''),
});

const overwriteSchema = z.object({
  target: objectId,
  kind: z.enum(['role', 'member']),
  allow: z.number().int().min(0),
  deny: z.number().int().min(0),
});

export const channelSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(CHANNEL_KINDS).default('text'),
  topic: z.string().trim().max(300).default(''),
  category: z.string().trim().max(40).default(''),
  slowModeSeconds: z.number().int().refine((v) => (SLOW_MODE_OPTIONS as readonly number[]).includes(v)).default(0),
  overwrites: z.array(overwriteSchema).max(50).default([]),
});

export const updateChannelSchema = channelSchema.partial().extend({ position: z.number().int().min(0).max(500).optional() });

export const roleSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).or(z.literal('')).default(''),
  permissions: z.number().int().min(0),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
  position: z.number().int().min(1).max(1000).optional(),
});

export const attachmentSchema = z.object({
  url: z.string().url().max(1000),
  name: z.string().max(200).default(''),
  mime: z.string().max(100).default(''),
  bytes: z.number().int().min(0).default(0),
});

export const postMessageSchema = z.object({
  content: z.string().max(MAX_HUB_MESSAGE_LENGTH, `Keep messages under ${MAX_HUB_MESSAGE_LENGTH} characters.`).default(''),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  replyTo: objectId.optional(),
  thread: objectId.optional(),
  title: z.string().trim().max(120).optional(),
});

export const messageQuerySchema = z.object({
  before: z.coerce.date().optional(),
  thread: objectId.optional(),
  pinned: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const messageActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('edit'), content: z.string().min(1).max(MAX_HUB_MESSAGE_LENGTH) }),
  z.object({ action: z.literal('pin') }),
  z.object({ action: z.literal('unpin') }),
  z.object({ action: z.literal('useful'), value: z.boolean() }),
]);

export const reactionSchema = z.object({ emoji: z.string().min(1).max(32) });

export const readSchema = z.object({ targetId: objectId, kind: z.enum(['channel', 'conversation']) });

export const startDmSchema = z.object({ userIds: z.array(objectId).min(1).max(9), name: z.string().trim().max(60).default('') });

export const dmMessageSchema = z.object({
  content: z.string().max(MAX_HUB_MESSAGE_LENGTH).default(''),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
});

export const discordBridgeSchema = z.object({
  webhookUrl: z.string().url().optional(),
  discordChannelId: z.string().regex(/^\d{5,25}$/, 'Discord channel ids are numbers.').optional(),
  direction: z.enum(['out', 'in', 'both']),
});
