import { sweepRooms } from './games/results';
import { sweepTournaments } from './games/tournaments';

type Sweep = (now: Date) => Promise<Record<string, number>>;

/**
 * Module-level sweeps run by /api/cron/maintenance. Each module adds its own;
 * one failing sweep never stops the others.
 */
const SWEEPS: Record<string, Sweep> = {
  games: sweepRooms,
  tournaments: sweepTournaments,
};

export async function runModuleMaintenance(now: Date): Promise<Record<string, number>> {
  const summary: Record<string, number> = {};
  for (const [name, sweep] of Object.entries(SWEEPS)) {
    try {
      for (const [key, value] of Object.entries(await sweep(now))) summary[`${name}.${key}`] = value;
    } catch (error) {
      console.error(`[maintenance] ${name} failed:`, error);
      summary[`${name}.failed`] = 1;
    }
  }
  return summary;
}
