import { cronRoute, ok } from '@/lib/api/handler';
import { runReminders } from '@/server/modules/reminders/engine';
import { reminderRules } from '@/server/modules/reminders/rules';

/** Every five minutes: sends whatever has come due, exactly once each. */
export const GET = cronRoute(async () => {
  const summary = await runReminders(await reminderRules());
  return ok({ ok: true, summary });
});
