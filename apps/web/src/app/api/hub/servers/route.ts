import { route, ok, created } from '@/lib/api/handler';
import { createServerSchema } from '@/server/modules/hub/schemas';
import { createServer, serversForUser } from '@/server/modules/hub/service';

/** The caller's servers (joining the campus server on first visit). */
export const GET = route({ feature: 'hub' }, async ({ actor }) => {
  const servers = await serversForUser(actor.id, actor.campus);
  return ok({ servers: servers.map((s) => ({ ...s, _id: String(s._id) })) });
});

/** Circles, course servers, and custom servers. Clubs and teams are created from their own modules. */
export const POST = route({ body: createServerSchema, rateLimit: 'post', feature: 'hub' }, async ({ actor, body }) => {
  const server = await createServer({ ...body, campus: actor.campus, ownerId: actor.id });
  return created({ server: { ...server.toObject(), _id: String(server._id) } });
});
