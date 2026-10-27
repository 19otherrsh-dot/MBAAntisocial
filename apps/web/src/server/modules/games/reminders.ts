import Tournament from '@/models/games/Tournament';
import type { DueReminder, ReminderRule } from '../reminders/engine';

const HOUR = 60 * 60_000;

/** Entrants hear an hour before a tournament starts. */
const tournamentStarting: ReminderRule = {
  key: 'tournament_starting',
  async collect(now) {
    const soon = await Tournament.find({ status: 'registration', startsAt: { $gt: now, $lte: new Date(now.getTime() + HOUR) } })
      .select('title entrants startsAt')
      .lean();
    const out: DueReminder[] = [];
    for (const t of soon) {
      for (const user of t.entrants) {
        out.push({
          user,
          kind: 'tournament_match',
          title: `${t.title} starts within the hour`,
          body: 'Your first table opens when it starts — keep notifications on.',
          href: `/tournaments/${t._id}`,
          entityType: 'Tournament',
          entity: t._id,
        });
      }
    }
    return out;
  },
};

/** A nudge when a tournament match is open and half its window has gone. */
const matchWaiting: ReminderRule = {
  key: 'tournament_match_waiting',
  async collect(now) {
    const running = await Tournament.find({ status: 'running', 'matches.status': 'ready' }).select('title matches matchWindowMinutes').lean();
    const out: DueReminder[] = [];
    for (const t of running) {
      const half = (t.matchWindowMinutes * 60_000) / 2;
      for (const m of t.matches) {
        if (m.status !== 'ready' || !m.deadline || !m.room) continue;
        if (m.deadline.getTime() - now.getTime() > half) continue;
        for (const user of m.players) {
          if (!user) continue;
          out.push({
            user,
            kind: 'tournament_match',
            title: `Your ${t.title} match is waiting`,
            body: 'Play it before the window closes or it is forfeited.',
            href: `/games/room/${m.room}`,
            entityType: 'GameRoom',
            entity: m.room,
          });
        }
      }
    }
    return out;
  },
};

export const gameReminderRules: ReminderRule[] = [tournamentStarting, matchWaiting];
