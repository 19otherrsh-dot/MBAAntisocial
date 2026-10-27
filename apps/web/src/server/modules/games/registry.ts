import { gameManifestSchema, type GameManifest } from '@mba/shared/games';
import GameRelease from '@/models/games/GameRelease';
import { GAME_CATALOG } from './catalog';
import published from './published.json';

/**
 * Where a game's manifest comes from, lowest priority first:
 *
 * 1. `catalog.ts` — every game, with or without a build.
 * 2. `published.json` — builds committed with the app by scripts/publish-game.ts
 *    and served from /game-builds on this origin.
 * 3. `GameRelease` documents — CDN builds published from the admin console,
 *    live without a redeploy.
 *
 * Each layer may only add `build` and adjust `network`; the identity of a game
 * (id, players, modes) is the catalog's.
 */
type Overlay = Partial<Pick<GameManifest, 'build' | 'network' | 'thumbnail'>>;

const CACHE_MS = 60_000;
let cache: { at: number; games: GameManifest[] } | null = null;

function merge(base: (typeof GAME_CATALOG)[number], overlay: Overlay | undefined): GameManifest {
  return gameManifestSchema.parse({
    ...base,
    ...(overlay?.thumbnail ? { thumbnail: overlay.thumbnail } : {}),
    ...(overlay?.build ? { build: overlay.build } : {}),
    ...(overlay?.network ? { network: { ...base.network, ...overlay.network } } : {}),
  });
}

async function releaseOverlays(): Promise<Map<string, Overlay>> {
  const overlays = new Map<string, Overlay>();
  try {
    const releases = await GameRelease.find({ active: true }).sort({ createdAt: -1 }).lean();
    for (const release of releases) {
      if (overlays.has(release.game)) continue; // Newest wins.
      overlays.set(release.game, release.manifest as Overlay);
    }
  } catch (error) {
    console.error('[games] could not load releases:', error);
  }
  return overlays;
}

export async function listGames(): Promise<GameManifest[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.games;
  const releases = await releaseOverlays();
  const files = published as Record<string, Overlay>;
  const games: GameManifest[] = [];
  for (const entry of GAME_CATALOG) {
    try {
      games.push(merge(entry, releases.get(entry.id) ?? files[entry.id]));
    } catch (error) {
      // A bad release must not take the catalog down: fall back to the base entry.
      console.error(`[games] invalid manifest for ${entry.id}:`, error);
      games.push(merge(entry, files[entry.id]));
    }
  }
  cache = { at: Date.now(), games };
  return games;
}

export async function getGame(id: string): Promise<GameManifest | null> {
  return (await listGames()).find((g) => g.id === id) ?? null;
}

export function invalidateGameCache() {
  cache = null;
}

/** Absolute or origin-relative URL of a build's entry HTML. */
export function buildEntryUrl(game: GameManifest): string | null {
  if (!game.build) return null;
  const base = game.build.assetBase.replace(/\/$/, '');
  return `${base}/${game.build.entry}`;
}

export function thumbnailUrl(game: GameManifest): string {
  if (!game.thumbnail) return '';
  if (/^https?:\/\//.test(game.thumbnail) || game.thumbnail.startsWith('/')) return game.thumbnail;
  return game.build ? `${game.build.assetBase.replace(/\/$/, '')}/${game.thumbnail}` : '';
}

export function isPlayable(game: GameManifest): boolean {
  return Boolean(game.build);
}
