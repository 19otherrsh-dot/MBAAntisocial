import { route, ok, created, paginate, pageMeta } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createQuestionSchema, questionQuerySchema, questionActionSchema } from '@/lib/validation';
import { award, revoke, grantBadge } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import InterviewQuestion from '@/models/InterviewQuestion';
import Application, { companyKeyOf } from '@/models/Application';
import { QUESTION_FRESHNESS_MONTHS } from '@/lib/constants';
import type { QueryFilter } from 'mongoose';
import type { IInterviewQuestion } from '@/models/InterviewQuestion';

const CONTRIBUTOR_FIELDS = 'name image year batch karma badges';

/**
 * The campus interview-question bank.
 *
 * Campus-scoped like everything else, which is the entire point: a generic
 * marketplace has users spread across every institute, so its density for any
 * one company at any one campus rounds to zero. "What the panel asked here,
 * last December" can only exist where the graph is a single batch.
 */
export const GET = route({ query: questionQuerySchema }, async ({ actor, query }) => {
  const { skip, limit } = paginate(query);

  const filter: QueryFilter<IInterviewQuestion> = {
    campus: actor.campus,
    hiddenAt: { $exists: false },
  };

  if (query.company) filter.companyKey = companyKeyOf(query.company);
  if (query.track) filter.track = query.track;
  if (query.roundType) filter.roundType = query.roundType;
  if (query.search) filter.$text = { $search: query.search };

  const sort = query.search
    ? { score: { $meta: 'textScore' } }
    : query.sort === 'useful'
      ? { upvoteCount: -1, askedAt: -1 }
      : { askedAt: -1 };

  const [questions, total, companies] = await Promise.all([
    InterviewQuestion.find(filter, query.search ? { score: { $meta: 'textScore' } } : {})
      .sort(sort as never)
      .skip(skip)
      .limit(limit)
      .populate('contributor', CONTRIBUTOR_FIELDS)
      .lean(),
    InterviewQuestion.countDocuments(filter),
    // The company list drives the filter, and doubles as the coverage signal:
    // a campus can see at a glance which employers it has intel on.
    InterviewQuestion.aggregate<{ _id: string; company: string; count: number }>([
      { $match: { campus: actor.campus, hiddenAt: { $exists: false } } },
      { $group: { _id: '$companyKey', company: { $first: '$company' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 60 },
    ]),
  ]);

  const staleBefore = new Date();
  staleBefore.setMonth(staleBefore.getMonth() - QUESTION_FRESHNESS_MONTHS);

  return ok({
    questions: questions.map((question) => serialiseQuestion(question, actor.id, staleBefore)),
    companies: companies.map((row) => ({ key: row._id, company: row.company, count: row.count })),
    pagination: pageMeta(query, total),
  });
});

export const POST = route({ body: createQuestionSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const key = companyKeyOf(body.company);
  if (!key) throw ApiError.badRequest('That company name does not contain any letters.');

  /*
   * A question logged from a tracked round is marked verified, because the
   * pipeline already records that this person sat that round at that company.
   * A freehand entry is still welcome but is not given the same standing.
   */
  let verified = false;
  let sourceApplication: string | undefined;
  let sourceRound: string | undefined;

  if (body.applicationId && body.roundId) {
    const application = await Application.findOne({ _id: body.applicationId, user: actor.id });
    const round = application?.rounds.find((entry) => String(entry._id) === body.roundId);

    if (application && round) {
      verified = true;
      sourceApplication = String(application._id);
      sourceRound = String(round._id);

      round.questionsLogged += 1;
      round.intelPromptedAt ??= new Date();
      await application.save();
    }
  }

  const question = await InterviewQuestion.create({
    contributor: actor.id,
    campus: actor.campus,
    company: body.company,
    companyKey: key,
    role: body.role,
    track: body.track,
    roundType: body.roundType,
    question: body.question,
    guidance: body.guidance,
    difficulty: body.difficulty,
    tags: [...new Set(body.tags.map((tag) => tag.toLowerCase()))],
    askedAt: body.askedAt,
    anonymous: body.anonymous,
    sourceApplication,
    sourceRound,
    verified,
  });

  await award(actor.id, 'question_contributed', { entityType: 'question', entity: question._id });

  const contributed = await InterviewQuestion.countDocuments({
    contributor: actor.id,
    hiddenAt: { $exists: false },
  });
  if (contributed >= 1) await grantBadge(actor.id, 'first_intel');
  if (contributed >= 10) await grantBadge(actor.id, 'intel_10');

  const populated = await InterviewQuestion.findById(question._id)
    .populate('contributor', CONTRIBUTOR_FIELDS)
    .lean();

  return created({ question: serialiseQuestion(populated!, actor.id, new Date(0)) });
});

export const PATCH = route({ body: questionActionSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const question = await InterviewQuestion.findOne({
    _id: body.questionId,
    campus: actor.campus,
    hiddenAt: { $exists: false },
  });
  if (!question) throw ApiError.notFound('That question is not available.');

  if (body.action === 'delete') {
    if (question.contributor.toString() !== actor.id && !actor.canModerate) {
      throw ApiError.forbidden('That is not yours to remove.');
    }
    await question.deleteOne();
    await revoke(question.contributor.toString(), 'question_contributed', question._id);
    return ok({ deleted: true });
  }

  const isOwn = question.contributor.toString() === actor.id;
  if (isOwn) throw ApiError.badRequest('You cannot upvote your own contribution.');

  const hasUpvoted = question.upvotes.some((id) => id.toString() === actor.id);

  const update = hasUpvoted
    ? { $pull: { upvotes: actor.id }, $inc: { upvoteCount: -1 } }
    : { $addToSet: { upvotes: actor.id }, $inc: { upvoteCount: 1 } };

  const updated = await InterviewQuestion.findByIdAndUpdate(question._id, update, { new: true })
    .select('upvoteCount')
    .lean();

  const contributorId = question.contributor.toString();

  if (hasUpvoted) {
    await revoke(contributorId, 'question_upvoted', question._id);
  } else {
    await award(contributorId, 'question_upvoted', { entityType: 'question', entity: question._id });
    await notify({
      user: contributorId,
      kind: 'question_upvoted',
      title: 'Your interview intel helped someone',
      body: question.question.slice(0, 140),
      href: `/intel?company=${encodeURIComponent(question.company)}`,
      entityType: 'question',
      entity: question._id,
      actor: actor.id,
    });
  }

  return ok({ upvoted: !hasUpvoted, upvoteCount: updated?.upvoteCount ?? 0 });
});

type LeanQuestion = Omit<IInterviewQuestion, 'contributor' | 'upvotes'> & {
  _id: unknown;
  contributor: unknown;
  upvotes?: unknown;
};

function serialiseQuestion(question: LeanQuestion, viewerId: string, staleBefore: Date) {
  const upvotes = (question.upvotes as Array<{ toString(): string }> | undefined) ?? [];
  const contributorId = String(
    (question.contributor as { _id?: unknown })?._id ?? question.contributor
  );
  const isOwn = contributorId === viewerId;

  return {
    ...question,
    _id: String(question._id),
    // The name is withheld from everyone except the person who wrote it. The id
    // stays server-side for moderation and karma; this only hides a byline.
    contributor: question.anonymous && !isOwn ? null : question.contributor,
    upvotes: undefined,
    hasUpvoted: upvotes.some((id) => String(id) === viewerId),
    isOwn,
    /** Older than the freshness window — still useful, but flag it as dated. */
    dated: new Date(question.askedAt) < staleBefore,
  };
}
