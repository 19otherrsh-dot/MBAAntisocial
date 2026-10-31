import { unstable_rethrow } from 'next/navigation';
import { sessionActor } from '@/lib/api/handler';
import { buildToday } from '@/server/modules/today/service';
import type { TodayResponse } from '@/components/today/types';
import TodayView from './TodayView';

/**
 * Today is the first screen of the day, so its cards are composed here on the
 * server, through the same service as /api/today, and arrive in the HTML. The
 * client still refreshes them as usual. Anything unusual (unverified, no
 * edition, a failure) falls back to the client fetch.
 */
export default async function TodayPage() {
  const actor = await sessionActor();
  let initial: TodayResponse | null = null;
  if (actor?.verified && actor.edition !== 'none') {
    try {
      // The API's JSON shape exactly: dates as strings, no class instances.
      initial = JSON.parse(JSON.stringify(await buildToday(actor))) as TodayResponse;
    } catch (error) {
      unstable_rethrow(error);
      console.error('[today] server render failed; the client will fetch', error);
    }
  }
  return <TodayView firstName={actor?.name.split(' ')[0]} initial={initial} />;
}
