import { z } from 'zod';
import { gameManifestSchema, NETWORK_TRANSPORTS } from '@mba/shared/games';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import GameRelease from '@/models/games/GameRelease';
import { GAME_CATALOG } from '@/server/modules/games/catalog';
import { invalidateGameCache, listGames } from '@/server/modules/games/registry';
import { audit } from './audit';

/**
 * Where a build may be served from: this origin's /game-builds, or an HTTPS
 * CDN. The bridge only talks to the frame's exact origin, and a cross-origin
 * build cannot reach the app's cookies or storage.
 */
const assetBase = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^\/game-builds\/[a-z0-9-]+\/[A-Za-z0-9._-]+\/?$/.test(v) || /^https:\/\/[^\s/]+\/\S*$/.test(v), {
    message: 'Use /game-builds/<game>/<version> on this site, or an https:// CDN folder.',
  })
  .transform((v) => v.replace(/\/$/, ''));

export const releaseSchema = z.object({
  game: z.string().trim(),
  version: z.string().trim().min(1).max(32),
  assetBase,
  entry: z.string().trim().min(1).max(200).default('index.html'),
  threads: z.boolean().default(false),
  sizeMb: z.number().min(0).max(2048).default(0),
  transport: z.enum(NETWORK_TRANSPORTS).optional(),
  serverPack: z.string().trim().max(500).optional(),
  thumbnail: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).default(''),
});

export async function releaseOverview() {
  const [games, releases] = await Promise.all([listGames(), GameRelease.find().sort({ createdAt: -1 }).limit(200).populate('publishedBy', 'name').lean()]);
  return {
    games: games.map((g) => ({
      id: g.id,
      title: g.title,
      category: g.category,
      transport: g.network.transport,
      build: g.build ? { version: g.build.version, assetBase: g.build.assetBase, threads: g.build.threads, publishedAt: g.build.publishedAt ?? null } : null,
    })),
    releases: releases.map((r) => {
      const build = (r.manifest as { build?: { version?: string; assetBase?: string } }).build;
      return {
        _id: String(r._id),
        game: r.game,
        version: build?.version ?? '?',
        assetBase: build?.assetBase ?? '',
        active: r.active,
        notes: r.notes,
        publishedBy: (r.publishedBy as unknown as { name?: string } | null)?.name ?? null,
        createdAt: r.createdAt,
      };
    }),
  };
}

export async function publishRelease(actor: Actor, input: z.infer<typeof releaseSchema>) {
  const base = GAME_CATALOG.find((g) => g.id === input.game);
  if (!base) throw ApiError.notFound('That game is not in the catalog.');

  const overlay = {
    build: {
      version: input.version,
      entry: input.entry,
      assetBase: input.assetBase,
      threads: input.threads,
      sizeMb: input.sizeMb,
      ...(input.serverPack ? { serverPack: input.serverPack } : {}),
      publishedAt: new Date().toISOString(),
    },
    ...(input.transport ? { network: { transport: input.transport } } : {}),
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
  };

  // Validate the merged manifest exactly as the registry will, so a bad
  // release is refused here rather than silently ignored at read time.
  const merged = gameManifestSchema.safeParse({ ...base, ...overlay, network: { ...base.network, ...(overlay.network ?? {}) } });
  if (!merged.success) {
    throw ApiError.unprocessable(merged.error.issues[0]?.message ?? 'That release does not make a valid manifest.');
  }

  const release = await GameRelease.create({ game: input.game, manifest: overlay, active: true, publishedBy: actor.id, notes: input.notes });
  invalidateGameCache();
  await audit(actor.id, {
    action: 'game.publish',
    targetType: 'game_release',
    targetId: String(release._id),
    targetLabel: `${base.title} ${input.version}`,
    after: overlay,
    reason: input.notes,
  });
  return { _id: String(release._id) };
}

/** Turning a release off rolls the game back to the next newest active one (or to coming soon). */
export async function setReleaseActive(actor: Actor, releaseId: string, active: boolean, reason: string) {
  const release = await GameRelease.findById(releaseId);
  if (!release) throw ApiError.notFound('That release does not exist.');
  if (release.active === active) return { active };
  release.active = active;
  await release.save();
  invalidateGameCache();
  const version = (release.manifest as { build?: { version?: string } }).build?.version ?? '?';
  await audit(actor.id, {
    action: active ? 'game.activate' : 'game.rollback',
    targetType: 'game_release',
    targetId: releaseId,
    targetLabel: `${release.game} ${version}`,
    before: { active: !active },
    after: { active },
    reason,
  });
  return { active };
}
