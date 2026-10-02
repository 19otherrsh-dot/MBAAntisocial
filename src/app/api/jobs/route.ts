import { route, ok, created, paginate, pageMeta } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createJobSchema, jobQuerySchema } from '@/lib/validation';
import Job from '@/models/Job';
import type { QueryFilter } from 'mongoose';
import type { IJob } from '@/models/Job';

const AUTHOR_FIELDS = 'name image year batch campus role';

/**
 * Campus opportunities.
 *
 * Scoped to the caller's campus. The previous version published every posting
 * globally, which meant a board of listings from institutes the reader has no
 * connection to — the same undifferentiated noise that makes a national
 * marketplace hard to trust, but without the volume that justifies it.
 */
export const GET = route({ query: jobQuerySchema }, async ({ actor, query }) => {
  const { skip, limit } = paginate(query);

  const filter: QueryFilter<IJob> = {
    campus: actor.campus,
    isActive: true,
    hiddenAt: { $exists: false },
  };
  if (query.kind !== 'all') filter.kind = query.kind;

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .lean(),
    Job.countDocuments(filter),
  ]);

  const now = Date.now();

  return ok({
    jobs: jobs
      // A closing date that has passed retires the post without anyone having
      // to remember to take it down.
      .filter((job) => !job.closesAt || new Date(job.closesAt).getTime() >= now)
      .map((job) => ({
        ...job,
        _id: String(job._id),
        isOwn: String((job.author as { _id?: unknown })?._id ?? job.author) === actor.id,
      })),
    pagination: pageMeta(query, total),
  });
});

/**
 * Anyone on campus may post.
 *
 * The old rule limited posting to alumni, which made sense for a referral-only
 * board but is wrong here: a club recruiting, a professor's TA slot, and a
 * student venture all come from people who are not alumni. Alumni referrals are
 * now one kind among several, and that kind is still restricted.
 */
export const POST = route({ body: createJobSchema, rateLimit: 'post' }, async ({ actor, body }) => {
  if (body.kind === 'alumni_referral' && actor.role !== 'alumni' && !actor.canModerate) {
    throw ApiError.forbidden('Only alumni can post a referral offer.');
  }

  const job = await Job.create({
    author: actor.id,
    campus: actor.campus,
    title: body.title,
    kind: body.kind,
    org: body.org,
    description: body.description,
    commitment: body.commitment,
    link: body.link,
    invitesContact: body.invitesContact,
    closesAt: body.closesAt ?? undefined,
  });

  const populated = await Job.findById(job._id).populate('author', AUTHOR_FIELDS).lean();

  return created({ job: { ...populated, _id: String(populated!._id), isOwn: true } });
});

export const DELETE = route({ rateLimit: 'write' }, async ({ actor, request }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw ApiError.badRequest('Which post?');

  const deleted = await Job.findOneAndDelete({ _id: id, author: actor.id });
  if (!deleted) throw ApiError.notFound('That post does not exist, or is not yours.');

  return ok({ deleted: true });
});
