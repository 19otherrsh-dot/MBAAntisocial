import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { featureAvailable } from '@mba/shared/campus';
import { searchProviders } from '@/server/modules/search/providers';
import { escapeRegex } from '@/server/modules/search/types';

const querySchema = z.object({ q: z.string().trim().min(2).max(80) });

/** Global search for the command palette: every provider in parallel, grouped by type. */
export const GET = route({ query: querySchema, rateLimit: 'search' }, async ({ actor, query }) => {
  const pattern = new RegExp(escapeRegex(query.q), 'i');
  const providers = (await searchProviders()).filter((p) => !p.campusOnly || featureAvailable('feed', actor.edition));
  const settled = await Promise.allSettled(providers.map((p) => p.search(actor, pattern, 5)));
  const groups = providers
    .map((provider, i) => ({
      type: provider.type,
      label: provider.label,
      results: settled[i].status === 'fulfilled' ? settled[i].value : [],
    }))
    .filter((group) => group.results.length > 0);
  return ok({ groups });
});
