import Tournament from '@/models/games/Tournament';
import type { SearchProvider } from '../search/types';
import { listGames } from './registry';

const games: SearchProvider = {
  type: 'game',
  label: 'Games',
  campusOnly: false,
  async search(_actor, pattern, limit) {
    const all = await listGames();
    return all
      .filter((g) => pattern.test(g.title) || g.tags.some((t) => pattern.test(t)))
      .slice(0, limit)
      .map((g) => ({ id: g.id, type: 'game', title: g.title, subtitle: g.build ? g.tagline : 'Coming soon', href: `/games/${g.id}` }));
  },
};

const tournaments: SearchProvider = {
  type: 'tournament',
  label: 'Tournaments',
  campusOnly: false,
  async search(actor, pattern, limit) {
    const rows = await Tournament.find({ campus: actor.campus, status: { $in: ['registration', 'running'] }, title: pattern })
      .select('title status game')
      .limit(limit)
      .lean();
    return rows.map((t) => ({ id: String(t._id), type: 'tournament', title: t.title, subtitle: t.status === 'registration' ? 'Open for entries' : 'In progress', href: `/tournaments/${t._id}` }));
  },
};

export const gameSearchProviders: SearchProvider[] = [games, tournaments];
