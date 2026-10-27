import type { IUser } from '../../src/models/User';

export interface SeedContext {
  campus: string;
  users: Array<IUser>;
  /** Days from now at a local hour. */
  at: (daysFromNow: number, hour: number, minute?: number) => Date;
}

type SeedModule = { name: string; run: (ctx: SeedContext) => Promise<string> };

/**
 * Each product area seeds itself; adding one is adding a file here.
 */
const MODULES: Array<() => Promise<SeedModule>> = [
  async () => ({ name: 'hub', run: (await import('./hub')).run }),
];

export async function runSeedModules(ctx: SeedContext) {
  for (const load of MODULES) {
    const mod = await load();
    const summary = await mod.run(ctx);
    console.log(`[seed:${mod.name}] ${summary}`);
  }
}

export function registerSeedModules(...loaders: Array<() => Promise<SeedModule>>) {
  MODULES.push(...loaders);
}
