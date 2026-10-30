import { z } from 'zod';
import { gameResultSchema } from '@mba/shared/games';
import { objectId } from '@/lib/validation';

const gameId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(48);
const optionValue = z.union([z.string().max(60), z.number().finite(), z.boolean()]);
const options = z.record(z.string().max(32), optionValue);

export const createRoomSchema = z.object({
  gameId,
  visibility: z.enum(['public', 'private']).default('private'),
  crossCampus: z.boolean().optional(),
  maxPlayers: z.number().int().min(1).max(16).optional(),
  rated: z.boolean().optional(),
  options: options.optional(),
});

export const quickMatchSchema = z.object({ gameId });
export const roomCodeSchema = z.object({ code: z.string().trim().min(4).max(8) });

export const roomActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }),
  z.object({ action: z.literal('spectate') }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('ready'), ready: z.boolean() }),
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('kick'), userId: objectId }),
  z.object({ action: z.literal('add_bot') }),
  z.object({ action: z.literal('remove_bot'), seat: z.number().int().min(0).max(15) }),
  z.object({ action: z.literal('options'), options, visibility: z.enum(['public', 'private']).optional() }),
  z.object({ action: z.literal('invite'), userIds: z.array(objectId).min(1).max(10) }),
  z.object({ action: z.literal('rematch') }),
]);

export const environmentSchema = z.object({
  platform: z.enum(['web', 'ios', 'android']).default('web'),
  locale: z.string().max(20).default('en-IN'),
  theme: z.enum(['light', 'dark']).default('light'),
  reducedMotion: z.boolean().default(false),
  muted: z.boolean().default(false),
});

export const sessionSchema = z.object({ environment: environmentSchema.default({ platform: 'web', locale: 'en-IN', theme: 'light', reducedMotion: false, muted: false }) });

export const resultSchema = z.object({ result: gameResultSchema });

export const soloResultSchema = z.object({
  gameId,
  mode: z.enum(['bot', 'local']),
  result: gameResultSchema.optional(),
});

export const serverReportSchema = z.object({ roomId: objectId, result: gameResultSchema });
export const verifyTicketSchema = z.object({ ticket: z.string().min(10).max(4000) });

export const createTournamentSchema = z.object({
  gameId,
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(1000).optional(),
  format: z.enum(['single_elimination', 'round_robin']).default('single_elimination'),
  maxEntrants: z.number().int().min(2).max(128).default(16),
  startsAt: z.coerce.date(),
  matchWindowMinutes: z.number().int().min(5).max(7 * 24 * 60).default(30),
});

export const tournamentActionSchema = z.object({ action: z.enum(['register', 'withdraw', 'start', 'cancel']) });
