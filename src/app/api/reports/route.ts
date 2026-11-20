import type { Types } from 'mongoose';
import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createReportSchema, resolveReportSchema } from '@/lib/validation';
import { notify } from '@/lib/notifications';
import { recordAudit } from '@/lib/audit';
import Report from '@/models/Report';
import Post from '@/models/Post';
import Resource from '@/models/Resource';
import Whisper from '@/models/Whisper';
import User from '@/models/User';
import { MODERATOR_ROLES, STAFF_ROLES } from '@/lib/constants';

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

  /*
   * Each report carries the thing it is about. The queue used to show only the
   * reason and who filed it, so a moderator was choosing between "hide" and
   * "dismiss" without ever seeing the content in question.
   */
  const previews = await Promise.all(reports.map((report) => previewOf(report, actor.campus)));

  return ok({
    reports: reports.map((r, index) => ({ ...r, _id: String(r._id), preview: previews[index] })),
  });
});

interface Preview {
  /** Who or what the report is about, e.g. an author or a professor's name. */
  subject: string;
  text: string;
  /** False when the target has since been deleted or already hidden. */
  available: boolean;
}

const GONE: Preview = { subject: '', text: 'This content no longer exists.', available: false };

async function previewOf(
  report: { targetType: string; target: Types.ObjectId; parent?: Types.ObjectId },
  campus: string
): Promise<Preview> {
  if (report.targetType === 'post') {
    const post = await Post.findOne({ _id: report.target, campus })
      .select('content author hiddenAt')
      .populate('author', 'name')
      .lean();
    if (!post) return GONE;
    return { subject: nameOf(post.author), text: post.content, available: !post.hiddenAt };
  }

  if (report.targetType === 'comment' && report.parent) {
    const post = await Post.findOne({ _id: report.parent, campus })
      .select('comments')
      .populate('comments.author', 'name')
      .lean();
    const comment = post?.comments.find((entry) => String(entry._id) === String(report.target));
    if (!comment) return GONE;
    return { subject: nameOf(comment.author), text: comment.content, available: !comment.hiddenAt };
  }

  if (report.targetType === 'resource') {
    const resource = await Resource.findOne({ _id: report.target, campus })
      .select('title description author hiddenAt')
      .populate('author', 'name')
      .lean();
    if (!resource) return GONE;
    return {
      subject: nameOf(resource.author),
      text: [resource.title, resource.description].filter(Boolean).join(' — '),
      available: !resource.hiddenAt,
    };
  }

  if (report.targetType === 'whisper') {
    // The author stays unpublished even here: a moderator judges the words,
    // and does not need to know who wrote them to take them down.
    const whisper = await Whisper.findOne({ _id: report.target, campus })
      .select('targetName content hiddenAt')
      .lean();
    if (!whisper) return GONE;
    return { subject: `About ${whisper.targetName}`, text: whisper.content, available: !whisper.hiddenAt };
  }

  if (report.targetType === 'user') {
    const user = await User.findOne({ _id: report.target, campus })
      .select('name batch year suspendedAt')
      .lean();
    if (!user) return GONE;
    return {
      subject: user.name,
      text: `${user.year === 2 ? 'Second' : 'First'} year · ${user.batch}`,
      available: !user.suspendedAt,
    };
  }

  return GONE;
}

function nameOf(value: unknown): string {
  return (value as { name?: string } | null)?.name ?? 'Unknown';
}

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

    if (body.resolution === 'suspend_user') {
      if (report.targetType !== 'user') {
        throw ApiError.badRequest('Only a report about a person can end in a suspension.');
      }
      if (!body.note) {
        throw ApiError.unprocessable('Some fields need fixing.', {
          note: 'Say why. A suspension without a recorded reason cannot be reviewed.',
        });
      }
      if (String(report.target) === actor.id) {
        throw ApiError.badRequest('You cannot suspend yourself.');
      }

      const subject = await User.findOne({ _id: report.target, campus: actor.campus }).select('role');
      if (!subject) throw ApiError.notFound('That account no longer exists.');

      // Moderators and staff are removed by an admin, not by each other.
      const isPrivileged =
        MODERATOR_ROLES.includes(subject.role) || STAFF_ROLES.includes(subject.role);
      if (isPrivileged && actor.role !== 'admin') {
        throw ApiError.forbidden('Only an admin can suspend a moderator or staff account.');
      }

      /*
       * Takes effect on the very next request: `route()` reads `suspendedAt`
       * from the database each time rather than trusting a thirty-day token.
       */
      await User.updateOne(
        { _id: subject._id },
        { $set: { suspendedAt: new Date(), suspendedBy: actor.id, suspensionReason: body.note.slice(0, 500) } }
      );
    }

    report.status = body.resolution === 'dismiss' ? 'dismissed' : 'actioned';

    const auditActor = { id: actor.id, campus: actor.campus, name: actor.name, role: actor.role };
    if (body.resolution === 'hide_content') {
      await recordAudit({
        actor: auditActor,
        action: 'content.hidden',
        target: { type: report.targetType, id: String(report.target) },
        detail: { reason: report.reason, note: body.note, report: String(report._id) },
      });
    }
    if (body.resolution === 'suspend_user') {
      await recordAudit({
        actor: auditActor,
        action: 'user.suspended',
        target: { type: 'user', id: String(report.target) },
        detail: { reason: body.note, report: String(report._id) },
      });
    }
    await recordAudit({
      actor: auditActor,
      action: 'report.resolved',
      target: { type: 'report', id: String(report._id) },
      detail: { resolution: body.resolution, targetType: report.targetType },
    });
    report.resolvedBy = actor.id as never;
    report.resolvedAt = new Date();
    report.resolutionNote = body.note;
    await report.save();

    await notify({
      user: report.reporter,
      kind: 'moderation_action',
      title: 'Your report was reviewed',
      body:
        body.resolution === 'suspend_user'
          ? 'A moderator reviewed it and has acted on the account. Thanks for flagging it.'
          : report.status === 'actioned'
          ? 'The content has been removed from your campus. Thanks for flagging it.'
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
