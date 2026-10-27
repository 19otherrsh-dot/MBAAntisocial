import { route, ok } from '@/lib/api/handler';
import { pushSubscribeSchema } from '@/lib/validation';
import PushDevice from '@/models/PushDevice';
import { container } from '@/server/container';

/** Registers this browser or phone for push. Re-registering moves the device to the caller. */
export const POST = route({ body: pushSubscribeSchema, rateLimit: 'write', allowUnverified: true }, async ({ actor, body }) => {
  const target = body.kind === 'web' ? body.endpoint : body.token;
  await PushDevice.updateOne(
    { target },
    {
      $set: {
        user: actor.id,
        kind: body.kind,
        keys: body.kind === 'web' ? body.keys : undefined,
        platform: body.platform,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true }
  );
  return ok({ registered: true });
});

export const DELETE = route({ allowUnverified: true }, async ({ actor, request }) => {
  const target = new URL(request.url).searchParams.get('target');
  if (target) await PushDevice.deleteOne({ target, user: actor.id });
  return ok({ removed: true });
});

/** The VAPID public key a browser needs to subscribe. */
export const GET = route({ allowUnverified: true }, async () => {
  const { webPush } = container();
  return ok({ publicKey: webPush.publicKey, enabled: webPush.configured });
});
