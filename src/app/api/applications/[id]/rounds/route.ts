import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { roundActionSchema, objectId } from '@/lib/validation';
import { award } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import Application, { serialiseRound } from '@/models/Application';
import Task from '@/models/Task';
import { ROUND_TYPE_META, APPLICATION_STAGE_META } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';

/**
 * Adds, updates, and removes the rounds inside one application.
 *
 * This endpoint is where the module earns its place. A scheduled round writes a
 * real deadline into the task list, and a concluded round opens the intel
 * prompt — so the two things the product wants (a reason to open it, and a
 * contribution to the question bank) both fall out of the student doing the
 * thing they were going to do anyway.
 */
export const PATCH = route(
  { body: roundActionSchema, rateLimit: 'write' },
  async ({ actor, body, params }) => {
    const id = objectId.parse(params.id);

    const application = await Application.findOne({ _id: id, user: actor.id });
    if (!application) throw ApiError.notFound('That application is not in your pipeline.');

    if (body.action === 'add') {
      const meta = ROUND_TYPE_META[body.type];

      application.rounds.push({
        type: body.type,
        label: body.label,
        scheduledAt: body.scheduledAt ?? undefined,
        outcome: 'pending',
        notes: '',
        questionsLogged: 0,
      } as never);

      // Adding a round means the process is live, whatever the stage said.
      if (application.stage === 'interested' || application.stage === 'applied') {
        application.stage = 'in_process';
        application.appliedAt ??= new Date();
      }

      await application.save();

      const round = application.rounds[application.rounds.length - 1];

      if (body.scheduledAt) {
        await Task.create({
          user: actor.id,
          title: `${meta.label} — ${application.company}`,
          description: application.role,
          type: 'personal',
          priority: 'high',
          dueAt: body.scheduledAt,
          application: application._id,
        });

        await notify({
          user: actor.id,
          kind: 'round_upcoming',
          title: `${meta.label} at ${application.company}`,
          body: `${formatDateTime(body.scheduledAt)}. ${
            meta.practiceWith ? 'Book a mock for it while there is still time.' : 'Good luck.'
          }`,
          href: `/pipeline/${application._id}`,
          entityType: 'application',
          entity: application._id,
        });
      }

      await award(actor.id, 'round_logged', { entityType: 'round', entity: round._id });

      return ok({ round: serialiseRound(round), stage: application.stage });
    }

    if (body.action === 'remove') {
      const index = application.rounds.findIndex((entry) => String(entry._id) === body.roundId);
      if (index === -1) throw ApiError.notFound('That round no longer exists.');

      application.rounds.splice(index, 1);
      await application.save();
      await Task.deleteMany({ user: actor.id, application: application._id, status: { $ne: 'completed' } });

      return ok({ removed: true });
    }

    const round = application.rounds.find((entry) => String(entry._id) === body.roundId);
    if (!round) throw ApiError.notFound('That round no longer exists.');

    if (body.action === 'dismiss_intel') {
      // Recorded so the prompt is shown once and then never again, whether or
      // not anything was contributed. Nagging is the fastest way to make people
      // stop opening the module.
      round.intelPromptedAt = new Date();
      await application.save();
      return ok({ dismissed: true });
    }

    // update
    const wasPending = round.outcome === 'pending';

    if (body.label !== undefined) round.label = body.label;
    if (body.notes !== undefined) round.notes = body.notes;
    if (body.scheduledAt !== undefined) round.scheduledAt = body.scheduledAt ?? undefined;

    if (body.outcome !== undefined && body.outcome !== round.outcome) {
      round.outcome = body.outcome;

      if (body.outcome !== 'pending') {
        round.completedAt = new Date();

        // A concluded round retires its deadline.
        await Task.deleteMany({
          user: actor.id,
          application: application._id,
          status: { $ne: 'completed' },
        });
      }

      // The process stage follows the rounds rather than being maintained twice.
      if (body.outcome === 'rejected' && !APPLICATION_STAGE_META[application.stage].closed) {
        application.stage = 'rejected';
        application.closedAt = new Date();
      } else if (body.outcome === 'cleared' && application.stage !== 'offer') {
        application.stage = 'in_process';
      }
    }

    await application.save();

    if (wasPending && round.outcome !== 'pending') {
      await award(actor.id, 'round_logged', { entityType: 'round', entity: round._id });
    }

    /*
     * The intel prompt opens on any concluded round, including a rejection —
     * especially a rejection. The questions that end a process are the ones
     * juniors most need, and they are exactly the ones nobody volunteers
     * unless asked at the moment they are still fresh.
     */
    const shouldPromptForIntel =
      wasPending &&
      round.outcome !== 'pending' &&
      round.outcome !== 'no_result' &&
      !round.intelPromptedAt &&
      ROUND_TYPE_META[round.type].practiceWith !== null;

    return ok({
      round: serialiseRound(round),
      stage: application.stage,
      promptForIntel: shouldPromptForIntel,
    });
  }
);
