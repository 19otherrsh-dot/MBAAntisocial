import { route } from '@/lib/api/handler';
import { exportAccount } from '@/lib/account/lifecycle';

/** Downloads everything stored about the caller, as one JSON file. */
export const GET = route({ rateLimit: 'account' }, async ({ actor }) => {
  const data = await exportAccount(actor.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="mbaantisocial-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
