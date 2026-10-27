import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { EXTERNAL_PROVIDERS, type ExternalProvider } from '@/models/ExternalAccount';
import { disconnect } from '@/server/modules/integrations/registry';

export const DELETE = route({ rateLimit: 'write' }, async ({ actor, params }) => {
  if (!EXTERNAL_PROVIDERS.includes(params.provider as ExternalProvider)) throw ApiError.notFound();
  await disconnect(actor.id, params.provider as ExternalProvider);
  return ok({ disconnected: true });
});
