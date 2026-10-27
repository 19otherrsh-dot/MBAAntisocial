import { z } from 'zod';
import { internalRoute, ok } from '@/lib/api/handler';
import { receiveInbound } from '@/server/modules/hub/discord';

const schema = z.object({
  discordChannelId: z.string().regex(/^\d+$/),
  messageId: z.string().regex(/^\d+$/),
  authorId: z.string().regex(/^\d+$/),
  authorName: z.string().max(100),
  authorAvatar: z.string().max(500).default(''),
  content: z.string().max(4000).default(''),
  attachments: z.array(z.object({ url: z.string().url(), name: z.string().max(200), contentType: z.string().optional(), size: z.number().optional() })).max(10).default([]),
});

/** Relayed by the realtime service's Discord gateway client. */
export const POST = internalRoute({ body: schema }, async ({ body }) => ok(await receiveInbound(body)));
