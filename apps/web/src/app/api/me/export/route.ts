import { NextResponse } from 'next/server';
import { route } from '@/lib/api/handler';
import { exportAccount } from '@/server/modules/account/service';

/** Everything stored about the caller, as a JSON file to download (the right of access). */
export const GET = route({ allowUnverified: true, rateLimit: 'write' }, async ({ actor }) => {
  const data = await exportAccount(actor.id);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="mbaantisocial-data-${day}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});
