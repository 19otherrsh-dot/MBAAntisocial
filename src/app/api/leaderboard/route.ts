import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { getLeaderboard } from '@/lib/gamification';
import User, { type IUser } from '@/models/User';
import type { QueryFilter } from 'mongoose';

const querySchema = z.object({
  track: z.enum(['karma', 'points']).default('karma'),
  scope: z.enum(['campus', 'global']).default('campus'),
});

/**
 * Campus leaderboard, defaulting to the karma track.
 *
 * Karma leads because §6.3 makes contribution the thing worth ranking — a
 * points board ranks whoever ticked the most boxes for themselves, which is
 * not the behaviour this product needs more of.
 *
 * Participation is opt-in; the response tells the caller where they stand only
 * if they opted in, and never exposes non-participants.
 */
export const GET = route({ query: querySchema }, async ({ actor, query }) => {
  const isGlobal = query.scope === 'global';
  const campusFilter = isGlobal ? null : actor.campus;

  const [rows, me] = await Promise.all([
    getLeaderboard(campusFilter, query.track, 25),
    User.findById(actor.id).select('leaderboardOptIn points karma streak campus').lean(),
  ]);

  const optedIn = me?.leaderboardOptIn ?? false;

  let myRank: number | null = null;
  if (optedIn && me) {
    // Rank as "how many opted-in peers are ahead of me", plus one.
    const aheadFilter: QueryFilter<IUser> = {
      leaderboardOptIn: true,
      suspendedAt: { $exists: false },
      [query.track]: { $gt: me[query.track] },
    };
    if (!isGlobal) aheadFilter.campus = actor.campus;

    const ahead = await User.countDocuments(aheadFilter);
    myRank = ahead + 1;
  }

  return ok({
    track: query.track,
    scope: query.scope,
    campus: actor.campus,
    rows,
    me: {
      optedIn,
      rank: myRank,
      points: me?.points ?? 0,
      karma: me?.karma ?? 0,
      streak: me?.streak ?? 0,
    },
  });
});
