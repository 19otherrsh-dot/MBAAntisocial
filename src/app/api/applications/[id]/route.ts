import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { updateApplicationSchema, objectId } from '@/lib/validation';
import Application, { companyKeyOf, serialiseRound } from '@/models/Application';
import Task from '@/models/Task';
import { APPLICATION_STAGE_META } from '@/lib/constants';

/**
 * Reads, updates, and deletes one application.
 *
 * Every query filters on `user` as well as `_id`, so an id belonging to someone
 * else simply matches nothing — ownership is never checked separately from the
 * lookup, which is what makes it impossible to forget.
 */
export const GET = route({}, async ({ actor, params }) => {
  const id = objectId.parse(params.id);

  const application = await Application.findOne({ _id: id, user: actor.id }).lean();
  if (!application) throw ApiError.notFound('That application is not in your pipeline.');

  return ok({
    application: {
      ...application,
      _id: String(application._id),
      rounds: (application.rounds ?? []).map(serialiseRound),
    },
  });
});

export const PATCH = route(
  { body: updateApplicationSchema, rateLimit: 'write' },
  async ({ actor, body, params }) => {
    const id = objectId.parse(params.id);

    const application = await Application.findOne({ _id: id, user: actor.id });
    if (!application) throw ApiError.notFound('That application is not in your pipeline.');

    const previousStage = application.stage;

    if (body.company !== undefined) {
      application.company = body.company;
      application.companyKey = companyKeyOf(body.company);
    }
    if (body.role !== undefined) application.role = body.role;
    if (body.track !== undefined) application.track = body.track;
    if (body.source !== undefined) application.source = body.source;
    if (body.notes !== undefined) application.notes = body.notes;

    if (body.stage !== undefined && body.stage !== previousStage) {
      application.stage = body.stage;

      // Timestamps are derived from the stage transition rather than asked for.
      if (previousStage === 'interested' && body.stage !== 'interested' && !application.appliedAt) {
        application.appliedAt = new Date();
      }
      application.closedAt = APPLICATION_STAGE_META[body.stage].closed ? new Date() : undefined;
    }

    await application.save();

    /*
     * A closed process has no live deadline. Clearing its tasks keeps the task
     * list honest — nothing is more corrosive to a tracker than deadlines for
     * things that already ended.
     */
    if (APPLICATION_STAGE_META[application.stage].closed && !APPLICATION_STAGE_META[previousStage].closed) {
      await Task.deleteMany({
        user: actor.id,
        application: application._id,
        status: { $ne: 'completed' },
      });
    }

    return ok({
      application: {
        ...application.toObject(),
        _id: String(application._id),
        rounds: application.rounds.map(serialiseRound),
      },
    });
  }
);

export const DELETE = route({ rateLimit: 'write' }, async ({ actor, params }) => {
  const id = objectId.parse(params.id);

  const deleted = await Application.findOneAndDelete({ _id: id, user: actor.id });
  if (!deleted) throw ApiError.notFound('That application is not in your pipeline.');

  await Task.deleteMany({ user: actor.id, application: deleted._id });

  /*
   * Contributed questions deliberately survive. They were given to the campus,
   * not attached to the contributor's own record-keeping, and removing them
   * because someone tidied their pipeline would quietly destroy the asset the
   * whole module exists to build.
   */
  return ok({ deleted: true });
});
