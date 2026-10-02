import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createReportSchema, resolveReportSchema } from '@/lib/validation';
import { notify } from '@/lib/notifications';
import Report from '@/models/Report';
import Post from '@/models/Post';
import Resource from '@/models/Resource';
import Whisper from '@/models/Whisper';

/**
 * Reporting and the moderator queue (§11).
 *
 * This exists in the first release rather than alongside a later anonymity
 * feature, because "add moderation tooling before shipping anonymity" only
 * works if the tooling is already there when the pressure to ship arrives.
 */

/** Files a report. Any signed-in user, one report per target. */
export const POST = route({ body: createReportSchema, rateLimit: 'report' }, async ({ actor, body }) => {
  try {
    const report = await Report.create({
      reporter: actor.id,
      campus: actor.campus,
      targetType: body.targetType,
      target: body.target,
      parent: body.parent,
      reason: body.reason,
      detail: body.detail,
    });

    return created({ report: { _id: String(report._id), status: report.status } });
  } catch (error) {
    // The unique (reporter, target) index makes a repeat filing a no-op rather
    // than a way to inflate the queue against someone.
    if (isDuplicateKey(error)) {
      return ok({ report: null, alreadyReported: true });
    }
    throw error;
  }
});

/** The moderator queue. */
export const GET = route({ requireModerator: true }, async ({ actor }) => {
  const reports = await Report.find({ campus: actor.campus, status: 'open' })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('reporter', 'name image')
    .lean();

  return ok({ reports: reports.map((r) => ({ ...r, _id: String(r._id) })) });
});

/** Resolves a report, optionally hiding the reported content. */
export const PATCH = route(
  { body: resolveReportSchema, requireModerator: true, rateLimit: 'write' },
  async ({ actor, body }) => {
    const report = await Report.findOne({ _id: body.reportId, campus: actor.campus });
    if (!report) throw ApiError.notFound('That report does not exist.');
    if (report.status !== 'open') throw ApiError.conflict('That report is already resolved.');

    if (body.resolution === 'hide_content') {
      /*
       * Content is hidden, never deleted. A moderation decision has to remain
       * reviewable — including when it was the wrong call.
       */
      const hide = {
        hiddenAt: new Date(),
        hiddenBy: actor.id,
        hiddenReason: `${report.reason}: ${body.note}`.slice(0, 500),
      };

      if (report.targetType === 'post') {
        await Post.updateOne({ _id: report.target }, { $set: hide });
      } else if (report.targetType === 'comment' && report.parent) {
        await Post.updateOne(
          { _id: report.parent, 'comments._id': report.target },
          { $set: { 'comments.$.hiddenAt': new Date() } }
        );
      } else if (report.targetType === 'resource') {
        await Resource.updateOne({ _id: report.target }, { $set: hide });
      } else if (report.targetType === 'whisper') {
        // The one place a takedown really matters: an anonymous review names a
        // real person, and without this there is no path to remove a
        // defamatory one.
        await Whisper.updateOne({ _id: report.target }, { $set: hide });
      }
    }

    report.status = body.resolution === 'hide_content' ? 'actioned' : 'dismissed';
    report.resolvedBy = actor.id as never;
    report.resolvedAt = new Date();
    report.resolutionNote = body.note;
    await report.save();

    await notify({
      user: report.reporter,
      kind: 'moderation_action',
      title: 'Your report was reviewed',
      body:
        report.status === 'actioned'
          ? 'The content has been removed from your campus feed. Thanks for flagging it.'
          : 'A moderator reviewed it and left the content up.',
      href: '/feed',
    });

    return ok({ report: { _id: String(report._id), status: report.status } });
  }
);

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}
