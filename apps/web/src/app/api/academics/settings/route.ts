import { route, ok } from '@/lib/api/handler';
import User from '@/models/User';
import { settingsSchema } from '@/server/modules/academics/schemas';

export const PATCH = route({ body: settingsSchema, rateLimit: 'write', feature: 'timetable' }, async ({ actor, body }) => {
  const set: Record<string, unknown> = {};
  if (body.gradeScale) set['academicSettings.gradeScale'] = body.gradeScale;
  if (body.currentTerm !== undefined) set['academicSettings.currentTerm'] = body.currentTerm;
  await User.updateOne({ _id: actor.id }, { $set: set });
  return ok({ ok: true });
});
