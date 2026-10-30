import { gameManifestSchema, type GameManifest } from '@mba/shared/games';
import GameRelease from '@/models/games/GameRelease';
import { container } from '@/server/container';
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

/*
 * Each instance keeps the merged catalog in memory. Publishing bumps a
 * generation counter in the shared KV, and every instance compares it at most
 * every few seconds, so a release reaches all instances within GENERATION_CHECK_MS
 * rather than waiting out a TTL. CACHE_MS is only a backstop (e.g. a release
 * edited directly in the database).
 */
const GENERATION_KEY = 'games:generation';
const GENERATION_CHECK_MS = 5_000;
const CACHE_MS = 10 * 60_000;
let cache: { at: number; checkedAt: number; generation: string; games: GameManifest[] } | null = null;

async function currentGeneration(): Promise<string> {
  return (await container().kv.get(GENERATION_KEY).catch(() => null)) ?? '0';
}

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
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    if (now - cache.checkedAt < GENERATION_CHECK_MS) return cache.games;
    const generation = await currentGeneration();
    if (generation === cache.generation) {
      cache.checkedAt = now;
      return cache.games;
    }
  }
  // Read the generation before the releases, so a publish landing in between is picked up next time.
  const generation = await currentGeneration();
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
  cache = { at: now, checkedAt: now, generation, games };
  return games;
}

export async function getGame(id: string): Promise<GameManifest | null> {
  return (await listGames()).find((g) => g.id === id) ?? null;
}

/** After a release changes: this instance rebuilds now, the others on their next generation check. */
export async function invalidateGameCache() {
  cache = null;
  // Long-lived so it never resets to a value an instance has already cached.
  await container().kv.incr(GENERATION_KEY, 365 * 24 * 60 * 60).catch((error) => console.error('[games] could not bump the catalog generation:', error));
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
