import { z } from 'zod';
import { route, created } from '@/lib/api/handler';
import { roomCode } from '@mba/shared/games';
import HubInvite from '@/models/hub/HubInvite';
import { env } from '@/lib/env';
import { requireServer } from '@/server/modules/hub/access';

const schema = z.object({ maxUses: z.number().int().min(0).max(500).default(0), expiresInHours: z.number().int().min(1).max(24 * 30).default(24 * 7) });

export const POST = route({ body: schema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { ctx } = await requireServer(actor.id, params.id, 'CREATE_INVITE');
  const code = roomCode(Math.random, 8);
  await HubInvite.create({ server: ctx.server._id, code, createdBy: actor.id, maxUses: body.maxUses, expiresAt: new Date(Date.now() + body.expiresInHours * 3_600_000) });
  return created({ code, url: `${env.APP_URL}/hub/invite/${code}` });
});
