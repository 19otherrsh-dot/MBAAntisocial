/**
 * Publishes a game build so it appears as playable in the catalog.
 *
 *   npm run publish-game -w @mba/web -- --id ludo --dir ~/exports/ludo-web --version 1.0.0
 *
 * Options
 *   --id <slug>            Catalog id (see src/server/modules/games/catalog.ts). Required.
 *   --dir <path>           The Godot "Web" export folder (index.html, .wasm, .pck, .js). Required unless --cdn.
 *   --version <semver>     Build version; builds are stored per version and cached forever. Required.
 *   --entry <file>         HTML entry inside the export. Default index.html.
 *   --threads | --no-threads  Override thread detection (threaded builds need cross-origin isolation).
 *   --server-pack <file>   Headless server .pck for dedicated-transport games.
 *   --transport <t>        Override the catalog's network transport (none|webrtc|relay|dedicated).
 *   --thumbnail <file>     Card image inside the export folder, e.g. thumbnail.png.
 *   --cdn <url>            The export is already uploaded here; record it without copying.
 *   --with-js-sdk          Copy packages/game-sdk/antisocial-sdk.js next to the entry (plain-JS games).
 *
 * Effects
 *   - copies the export to public/game-builds/<id>/<version>/ (unless --cdn)
 *   - copies a server pack to <repo>/game-servers/<id>/<version>/server.pck (never public)
 *   - records the build in src/server/modules/games/published.json, which ships with the app
 *
 * For a CDN build that should go live without a redeploy, publish it from the
 * admin console instead (it writes a GameRelease document).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameManifestSchema, NETWORK_TRANSPORTS, type NetworkTransport } from '@mba/shared/games';
import { GAME_CATALOG } from '../src/server/modules/games/catalog';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const publishedPath = path.join(webRoot, 'src/server/modules/games/published.json');

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function folderSizeMb(dir: string): number {
  let bytes = 0;
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else bytes += stat.size;
    }
  };
  walk(dir);
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

/** Godot 4.0–4.2 threaded exports ship a worker script; 4.3+ says so in GODOT_CONFIG. */
function detectThreads(dir: string, entry: string): boolean {
  if (readdirSync(dir).some((f) => f.endsWith('.worker.js'))) return true;
  const html = readFileSync(path.join(dir, entry), 'utf8');
  return /"emscriptenPoolSize"\s*:\s*[1-9]/.test(html) || /GODOT_THREADS_ENABLED\s*=\s*true/.test(html);
}

function main() {
  const id = arg('id') ?? fail('Pass --id <game id>.');
  const version = arg('version') ?? fail('Pass --version <version>.');
  if (!/^[0-9A-Za-z.\-+]{1,32}$/.test(version)) fail('Versions use letters, digits, dots, and dashes.');
  const base = GAME_CATALOG.find((g) => g.id === id) ?? fail(`No game "${id}" in catalog.ts. Add it there first.`);
  const entry = arg('entry') ?? 'index.html';
  const cdn = arg('cdn');
  const dir = arg('dir') ? path.resolve(process.cwd(), arg('dir')!) : undefined;
  if (!cdn && !dir) fail('Pass --dir <export folder> or --cdn <url>.');
  if (dir && !existsSync(path.join(dir, entry))) fail(`${entry} not found in ${dir}.`);

  const transportArg = arg('transport');
  if (transportArg && !NETWORK_TRANSPORTS.includes(transportArg as NetworkTransport)) fail(`--transport must be one of ${NETWORK_TRANSPORTS.join(', ')}.`);

  let assetBase: string;
  let sizeMb = 0;
  if (cdn) {
    assetBase = cdn.replace(/\/$/, '');
  } else {
    const target = path.join(webRoot, 'public/game-builds', id, version);
    mkdirSync(target, { recursive: true });
    cpSync(dir!, target, { recursive: true });
    if (flag('with-js-sdk')) cpSync(path.join(repoRoot, 'packages/game-sdk/antisocial-sdk.js'), path.join(target, 'antisocial-sdk.js'));
    assetBase = `/game-builds/${id}/${version}`;
    sizeMb = folderSizeMb(target);
    console.log(`→ copied export to public/game-builds/${id}/${version} (${sizeMb} MB)`);
  }

  let serverPack: string | undefined;
  const packArg = arg('server-pack');
  if (packArg) {
    const source = path.resolve(process.cwd(), packArg);
    if (!existsSync(source) || !source.endsWith('.pck')) fail('--server-pack must point to a .pck file.');
    const target = path.join(repoRoot, 'game-servers', id, version);
    mkdirSync(target, { recursive: true });
    cpSync(source, path.join(target, 'server.pck'));
    serverPack = `${id}/${version}/server.pck`;
    console.log(`→ server pack stored at game-servers/${serverPack}`);
  }

  const threads = flag('threads') ? true : flag('no-threads') ? false : dir ? detectThreads(dir, entry) : false;
  const overlay = {
    build: { version, entry, assetBase, threads, sizeMb, ...(serverPack ? { serverPack } : {}), publishedAt: new Date().toISOString() },
    ...(transportArg ? { network: { ...base.network, transport: transportArg as NetworkTransport } } : {}),
    ...(arg('thumbnail') ? { thumbnail: arg('thumbnail') } : {}),
  };

  // Validate the merged manifest exactly as the registry will.
  const merged = gameManifestSchema.safeParse({ ...base, ...overlay, network: { ...base.network, ...(overlay.network ?? {}) } });
  if (!merged.success) fail(`The resulting manifest is invalid:\n${merged.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`);

  const published = existsSync(publishedPath) ? (JSON.parse(readFileSync(publishedPath, 'utf8')) as Record<string, unknown>) : {};
  published[id] = overlay;
  writeFileSync(publishedPath, `${JSON.stringify(published, null, 2)}\n`);

  console.log(`\n✔ ${base.title} ${version} published${threads ? ' (threaded build — served cross-origin isolated)' : ''}.`);
  console.log('  Commit public/game-builds and published.json, then deploy.\n');
}

main();
