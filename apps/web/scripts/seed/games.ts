import GameRoom from '../../src/models/games/GameRoom';
import GameRating from '../../src/models/games/GameRating';
import GameMatch from '../../src/models/games/GameMatch';
import Tournament from '../../src/models/games/Tournament';
import type { SeedContext } from './index';

/** Ratings, a match history, and an open tournament, all on the reference game. */
export async function run({ campus, users, at }: SeedContext): Promise<string> {
  const ids = users.map((u) => u._id);
  await Promise.all([
    GameRoom.deleteMany({ campus }),
    GameRating.deleteMany({ user: { $in: ids } }),
    GameMatch.deleteMany({ campus }),
    Tournament.deleteMany({ campus }),
  ]);

  const byEmail = (prefix: string) => users.find((u) => u.email.startsWith(`${prefix}@`));
  const ladder: Array<[string, number, number, number]> = [
    ['arjun', 1318, 14, 10],
    ['priya', 1276, 11, 7],
    ['devansh', 1241, 9, 5],
    ['meera', 1204, 6, 3],
    ['rohit', 1188, 8, 3],
  ];
  for (const [prefix, rating, played, wins] of ladder) {
    const user = byEmail(prefix);
    if (!user) continue;
    await GameRating.create({ user: user._id, game: 'tic-tac-toe', campus, rating, peak: rating + 12, gamesPlayed: played, wins, losses: played - wins, draws: 0, lastPlayedAt: new Date() });
  }

  const arjun = byEmail('arjun');
  const priya = byEmail('priya');
  if (arjun && priya) {
    await GameMatch.create({
      game: 'tic-tac-toe',
      campus,
      mode: 'online',
      rated: true,
      players: [
        { user: arjun._id, isBot: false, placement: 1, ratingBefore: 1302, ratingAfter: 1318 },
        { user: priya._id, isBot: false, placement: 2, ratingBefore: 1292, ratingAfter: 1276 },
      ],
      summary: 'Arjun won in 7 moves',
      source: 'consensus',
      finishedAt: new Date(Date.now() - 3 * 60 * 60_000),
    });
  }

  const entrants = ['arjun', 'priya', 'devansh', 'meera'].map(byEmail).filter(Boolean).map((u) => u!._id);
  if (arjun) {
    await Tournament.create({
      campus,
      game: 'tic-tac-toe',
      title: 'Between-lectures Cup',
      description: 'Knockout, two minutes a game. Winner picks the next Friday movie.',
      format: 'single_elimination',
      createdBy: arjun._id,
      entrants,
      maxEntrants: 8,
      startsAt: at(2, 18),
      matchWindowMinutes: 30,
    });
  }
  return `${ladder.length} ratings, 1 match, 1 tournament`;
}
