import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createApplicationSchema, applicationQuerySchema } from '@/lib/validation';
import Application, { companyKeyOf, serialiseRound } from '@/models/Application';
import InterviewQuestion from '@/models/InterviewQuestion';
import { APPLICATION_STAGE_META, type ApplicationStage } from '@/lib/constants';
import type { QueryFilter } from 'mongoose';
import type { IApplication } from '@/models/Application';

const OPEN_STAGES: ApplicationStage[] = ['interested', 'applied', 'in_process'];

/**
 * The caller's own placement pipeline.
 *
 * Every query is scoped to `user`, and no endpoint anywhere exposes another
 * student's applications. Who applied where — and who was rejected — is the
 * most sensitive data in the product; only the intel bank is shared, and that
 * is contributed to deliberately.
 */
export const GET = route({ query: applicationQuerySchema }, async ({ actor, query }) => {
  const filter: QueryFilter<IApplication> = { user: actor.id };

  if (query.stage === 'open') filter.stage = { $in: OPEN_STAGES };
  else if (query.stage !== 'all') filter.stage = query.stage;

  if (query.track) filter.track = query.track;

  const applications = await Application.find(filter)
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  /*
   * How much intel already exists for the companies in this pipeline. This is
   * the join that makes the module worth opening: a student sees not only that
   * they have a case round on Thursday, but that eleven people from their own
   * campus have logged what was asked in it.
   */
  const companyKeys = [...new Set(applications.map((row) => row.companyKey))];
  const intelCounts = companyKeys.length
    ? await InterviewQuestion.aggregate<{ _id: string; count: number }>([
        { $match: { campus: actor.campus, companyKey: { $in: companyKeys }, hiddenAt: { $exists: false } } },
        { $group: { _id: '$companyKey', count: { $sum: 1 } } },
      ])
    : [];

  const intelByCompany = new Map(intelCounts.map((row) => [row._id, row.count]));

  return ok({
    applications: applications.map((application) => ({
      ...application,
      _id: String(application._id),
      rounds: (application.rounds ?? []).map(serialiseRound),
      intelAvailable: intelByCompany.get(application.companyKey) ?? 0,
    })),
    summary: summarise(applications),
  });
});

export const POST = route(
  { body: createApplicationSchema, rateLimit: 'write' },
  async ({ actor, body }) => {
    const key = companyKeyOf(body.company);
    if (!key) throw ApiError.badRequest('That company name does not contain any letters.');

    const duplicate = await Application.findOne({
      user: actor.id,
      companyKey: key,
      role: body.role,
    })
      .select('_id')
      .lean();

    if (duplicate) {
      throw ApiError.conflict('That company and role is already in your pipeline.');
    }

    const application = await Application.create({
      user: actor.id,
      campus: actor.campus,
      company: body.company,
      companyKey: key,
      role: body.role,
      track: body.track,
      source: body.source,
      stage: body.stage,
      notes: body.notes,
      appliedAt: body.stage === 'interested' ? undefined : new Date(),
    });

    return created({
      application: { ...application.toObject(), _id: String(application._id) },
    });
  }
);

function summarise(applications: Array<{ stage: ApplicationStage; rounds?: Array<{ scheduledAt?: Date; outcome: string }> }>) {
  const counts = { open: 0, offers: 0, closed: 0, upcomingRounds: 0 };
  const now = Date.now();

  for (const application of applications) {
    if (APPLICATION_STAGE_META[application.stage].closed) counts.closed += 1;
    else counts.open += 1;

    if (application.stage === 'offer') counts.offers += 1;

    for (const round of application.rounds ?? []) {
      if (round.outcome === 'pending' && round.scheduledAt && new Date(round.scheduledAt).getTime() > now) {
        counts.upcomingRounds += 1;
      }
    }
  }

  return counts;
}
