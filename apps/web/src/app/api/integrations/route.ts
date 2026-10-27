import { route, ok } from '@/lib/api/handler';
import ExternalAccount from '@/models/ExternalAccount';
import { connectors } from '@/server/modules/integrations/registry';

/** Integrations available on this deployment and whether the caller has connected each. */
export const GET = route({}, async ({ actor }) => {
  const [available, connected] = await Promise.all([
    connectors(),
    ExternalAccount.find({ user: actor.id }).select('provider accountEmail createdAt').lean(),
  ]);
  return ok({
    integrations: available.map((c) => {
      const account = connected.find((a) => a.provider === c.provider);
      return {
        provider: c.provider,
        label: c.label,
        description: c.description,
        connected: Boolean(account),
        accountEmail: account?.accountEmail ?? null,
      };
    }),
  });
});
