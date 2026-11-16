import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { Types } from 'mongoose';
import { getLeaderboard } from '@/lib/gamification';
import LedgerEntry from '@/models/LedgerEntry';
import { startOfWeek } from '@/lib/time';
import User, { type IUser } from '@/models/User';
import type { QueryFilter } from 'mongoose';

const querySchema = z.object({
  track: z.enum(['karma', 'points', 'week']).default('karma'),
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
/**
 * The weekly league: XP earned since Monday, among people who opted in. It
 * resets every week, so a newcomer can top it — unlike the lifetime boards,
 * which reward whoever arrived first.
 */
async function weeklyLeague(campus: string | null, viewerId: string) {
  const users = await User.find({
    leaderboardOptIn: true,
    suspendedAt: { $exists: false },
    ...(campus ? { campus } : {}),
  })
    .select('_id')
    .lean();
  const ids = users.map((user) => user._id);

  const totals = await LedgerEntry.aggregate<{ _id: Types.ObjectId; xp: number }>([
    { $match: { user: { $in: ids }, createdAt: { $gte: startOfWeek() } } },
    { $group: { _id: '$user', xp: { $sum: '$amount' } } },
    { $match: { xp: { $gt: 0 } } },
    { $sort: { xp: -1 } },
  ]);

  const top = totals.slice(0, 25);
  const people = await User.find({ _id: { $in: top.map((row) => row._id) } })
    .select('name image year streak badges campus points karma')
    .lean();
  const byId = new Map(people.map((person) => [String(person._id), person]));

  const rows = top.flatMap((row) => {
    const person = byId.get(String(row._id));
    if (!person) return [];
    return [{
      _id: String(person._id),
      name: person.name,
      image: person.image ?? '',
      year: person.year,
      points: person.points,
      karma: person.karma,
      streak: person.streak,
      badges: person.badges ?? [],
      campus: person.campus,
      weekXp: row.xp,
    }];
  });

  const myIndex = totals.findIndex((row) => String(row._id) === viewerId);
  return {
    rows,
    rank: myIndex === -1 ? null : myIndex + 1,
    myXp: myIndex === -1 ? 0 : totals[myIndex].xp,
    // How far behind the person one place ahead, for "12 XP to pass Priya".
    gapToNext: myIndex > 0 ? totals[myIndex - 1].xp - totals[myIndex].xp + 1 : null,
  };
}

export const GET = route({ query: querySchema }, async ({ actor, query }) => {
  if (query.track === 'week') {
    const isGlobal = query.scope === 'global';
    const me = await User.findById(actor.id).select('leaderboardOptIn points karma streak').lean();
    const league = await weeklyLeague(isGlobal ? null : actor.campus, actor.id);
    return ok({
      track: query.track,
      scope: query.scope,
      campus: actor.campus,
      rows: league.rows,
      me: {
        optedIn: me?.leaderboardOptIn ?? false,
        rank: me?.leaderboardOptIn ? league.rank : null,
        points: me?.points ?? 0,
        karma: me?.karma ?? 0,
        streak: me?.streak ?? 0,
        weekXp: league.myXp,
        gapToNext: league.gapToNext,
      },
    });
  }

  const isGlobal = query.scope === 'global';
  const campusFilter = isGlobal ? null : actor.campus;

  const [rows, me] = await Promise.all([
    getLeaderboard(campusFilter, query.track as 'karma' | 'points', 25),
    User.findById(actor.id).select('leaderboardOptIn points karma streak campus').lean(),
  ]);

  const optedIn = me?.leaderboardOptIn ?? false;

  let myRank: number | null = null;
  if (optedIn && me) {
    // Rank as "how many opted-in peers are ahead of me", plus one.
    const aheadFilter: QueryFilter<IUser> = {
      leaderboardOptIn: true,
      suspendedAt: { $exists: false },
      [query.track]: { $gt: me[query.track as 'karma' | 'points'] },
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
