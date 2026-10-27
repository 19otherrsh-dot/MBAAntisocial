import { cronRoute, ok } from '@/lib/api/handler';
import InterviewSlot from '@/models/InterviewSlot';
import PushDevice from '@/models/PushDevice';

/**
 * Housekeeping that keeps reads honest: available slots whose time passed are
 * closed, and push devices unseen for 90 days are dropped. Further modules
 * append their own sweeps here.
 */
export const GET = cronRoute(async () => {
  const now = new Date();
  const [expiredSlots, staleDevices] = await Promise.all([
    InterviewSlot.updateMany({ status: 'available', startAt: { $lt: now } }, { $set: { status: 'cancelled', cancellationReason: 'Expired unbooked' } }),
    PushDevice.deleteMany({ lastSeenAt: { $lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } }),
  ]);
  const extra = await import('@/server/modules/maintenance').then((m) => m.runModuleMaintenance(now)).catch(() => ({}));
  return ok({ ok: true, expiredSlots: expiredSlots.modifiedCount, staleDevices: staleDevices.deletedCount, ...extra });
});
