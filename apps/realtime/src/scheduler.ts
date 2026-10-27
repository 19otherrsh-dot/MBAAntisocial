import { config } from './config.js';

/**
 * Calls the web app's cron endpoints on a schedule, for deployments that are
 * not on Vercel (whose `vercel.json` crons do the same job). Enable with
 * SCHEDULER_ENABLED=true on exactly one realtime instance.
 */
interface Job {
  path: string;
  /** Run every N minutes, or… */
  everyMinutes?: number;
  /** …once a week at this UTC day/time. */
  weekly?: { day: number; hour: number; minute: number };
}

const JOBS: Job[] = [
  { path: '/api/cron/reminders', everyMinutes: 5 },
  { path: '/api/cron/news', everyMinutes: 60 },
  { path: '/api/cron/maintenance', everyMinutes: 60 * 6 },
  // Monday 09:00 IST.
  { path: '/api/cron/digest', weekly: { day: 1, hour: 3, minute: 30 } },
];

async function run(job: Job) {
  try {
    const res = await fetch(new URL(job.path, config.WEB_INTERNAL_URL), {
      method: 'GET',
      headers: config.CRON_SECRET ? { Authorization: `Bearer ${config.CRON_SECRET}` } : {},
    });
    console.info(`[scheduler] ${job.path} → ${res.status}`);
  } catch (error) {
    console.error(`[scheduler] ${job.path} failed:`, (error as Error).message);
  }
}

export function startScheduler() {
  if (!config.SCHEDULER_ENABLED) return;
  console.info('[scheduler] enabled');
  const lastRun = new Map<string, number>();

  setInterval(() => {
    const now = new Date();
    for (const job of JOBS) {
      const last = lastRun.get(job.path) ?? 0;
      let due = false;
      if (job.everyMinutes) due = now.getTime() - last >= job.everyMinutes * 60_000;
      else if (job.weekly) {
        const { day, hour, minute } = job.weekly;
        due =
          now.getUTCDay() === day &&
          now.getUTCHours() === hour &&
          now.getUTCMinutes() === minute &&
          now.getTime() - last > 23 * 60 * 60_000;
      }
      if (due) {
        lastRun.set(job.path, now.getTime());
        void run(job);
      }
    }
  }, 30_000).unref();
}
