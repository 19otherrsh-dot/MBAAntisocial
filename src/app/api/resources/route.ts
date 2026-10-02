import { route, ok, created, paginate, pageMeta } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createResourceSchema, resourceActionSchema, resourceQuerySchema } from '@/lib/validation';
import { award, revoke, grantBadge } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import Resource from '@/models/Resource';
import User from '@/models/User';
import type { QueryFilter } from 'mongoose';
import type { IResource } from '@/models/Resource';

const AUTHOR_FIELDS = 'name image year karma badges';

/** Browse and search the campus resource library. */
export const GET = route({ query: resourceQuerySchema }, async ({ actor, query }) => {
  const { skip, limit } = paginate(query);

  const filter: QueryFilter<IResource> = {
    hiddenAt: { $exists: false },
  };
  if (actor.role !== 'alumni') {
    filter.campus = actor.campus;
  }
  if (query.course) filter.course = query.course;
  if (query.kind) filter.kind = query.kind;
  if (query.search) filter.$text = { $search: query.search };

  /*
   * Sorting happens in the database against the maintained `upvoteCount`
   * field. The previous version sorted on the raw `upvotes` array — which
   * orders by array contents, not length — then re-sorted the current page in
   * JavaScript, so "most upvoted" only ever ranked twenty arbitrary rows.
   */
  const sort: Record<string, unknown> = query.search
    ? { score: { $meta: 'textScore' } }
    : query.sort === 'upvotes'
      ? { upvoteCount: -1, createdAt: -1 }
      : query.sort === 'downloads'
        ? { downloads: -1, createdAt: -1 }
        : { createdAt: -1 };

  const projection = query.search ? { score: { $meta: 'textScore' } } : {};

  const [resources, total, courses] = await Promise.all([
    Resource.find(filter, projection)
      .sort(sort as never)
      .skip(skip)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .lean(),
    Resource.countDocuments(filter),
    Resource.distinct('course', filter),
  ]);

  return ok({
    resources: resources.map((resource) => serialiseResource(resource, actor.id)),
    courses: (courses as string[]).sort(),
    pagination: pageMeta(query, total),
  });
});

/** Publishes a resource. Gated on honor-code acceptance (§6.5). */
export const POST = route({ body: createResourceSchema, rateLimit: 'upload' }, async ({ actor, body }) => {
  const user = await User.findById(actor.id).select('honorCodeAcceptedAt').lean();
  if (!user?.honorCodeAcceptedAt) {
    throw ApiError.forbidden('Accept the sharing policy before uploading — it takes ten seconds.');
  }

  const resource = await Resource.create({
    ...body,
    author: actor.id,
    campus: actor.campus,
    tags: [...new Set(body.tags.map((tag) => tag.toLowerCase()))],
  });

  await award(actor.id, 'resource_shared', { entityType: 'resource', entity: resource._id });

  const shared = await Resource.countDocuments({ author: actor.id, hiddenAt: { $exists: false } });
  if (shared >= 10) await grantBadge(actor.id, 'archivist');

  const populated = await Resource.findById(resource._id).populate('author', AUTHOR_FIELDS).lean();

  return created({ resource: serialiseResource(populated!, actor.id) });
});

export const PATCH = route({ body: resourceActionSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const resource = await Resource.findOne({
    _id: body.resourceId,
    campus: actor.campus,
    hiddenAt: { $exists: false },
  });
  if (!resource) throw ApiError.notFound('That resource is not available.');

  if (body.action === 'upvote') {
    const isOwn = resource.author.toString() === actor.id;
    if (isOwn) throw ApiError.badRequest('You cannot upvote your own upload.');

    const hasUpvoted = resource.upvotes.some((id) => id.toString() === actor.id);

    /*
     * `$addToSet`/`$pull` with a matching `$inc` keeps the array and the
     * denormalised counter in step under concurrent votes, which a
     * read-modify-write on the array would not.
     */
    const update = hasUpvoted
      ? { $pull: { upvotes: actor.id }, $inc: { upvoteCount: -1 } }
      : { $addToSet: { upvotes: actor.id }, $inc: { upvoteCount: 1 } };

    const updated = await Resource.findByIdAndUpdate(resource._id, update, { new: true })
      .select('upvoteCount author title')
      .lean();

    const authorId = resource.author.toString();

    if (hasUpvoted) {
      await revoke(authorId, 'resource_upvoted', resource._id);
    } else {
      await award(authorId, 'resource_upvoted', { entityType: 'resource', entity: resource._id });
      if ((updated?.upvoteCount ?? 0) >= 50) await grantBadge(authorId, 'well_read');

      await notify({
        user: authorId,
        kind: 'resource_upvoted',
        title: 'Someone found your notes useful',
        body: resource.title,
        href: '/resources',
        entityType: 'resource',
        entity: resource._id,
        actor: actor.id,
      });
    }

    return ok({ upvoted: !hasUpvoted, upvoteCount: updated?.upvoteCount ?? 0 });
  }

  if (body.action === 'download') {
    await Resource.updateOne({ _id: resource._id }, { $inc: { downloads: 1 } });
    return ok({ fileUrl: resource.fileUrl, fileName: resource.fileName });
  }

  // new_version — only the author may replace the file, and the old one is kept.
  if (resource.author.toString() !== actor.id) {
    throw ApiError.forbidden('Only the uploader can post a new version.');
  }

  resource.versionHistory.push({
    version: resource.version,
    fileUrl: resource.fileUrl,
    fileName: resource.fileName,
    fileSize: resource.fileSize,
    note: body.note,
    replacedAt: new Date(),
  });
  resource.version += 1;
  resource.fileUrl = body.fileUrl;
  resource.fileName = body.fileName;
  resource.fileType = body.fileType;
  resource.fileSize = body.fileSize;
  await resource.save();

  return ok({ version: resource.version });
});

/** Removes an upload. Authors only; moderators use the moderation endpoint. */
export const DELETE = route({ rateLimit: 'write' }, async ({ actor, request }) => {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw ApiError.badRequest('Which resource?');

  const deleted = await Resource.findOneAndDelete({ _id: id, author: actor.id });
  if (!deleted) throw ApiError.notFound('That resource does not exist, or is not yours.');

  await revoke(actor.id, 'resource_shared', deleted._id);

  return ok({ deleted: true });
});

/** Lean resource with reference fields widened to cover populated documents. */
type LeanResource = Omit<IResource, 'author' | 'upvotes'> & {
  _id: unknown;
  author: unknown;
  upvotes?: unknown;
};

function serialiseResource(resource: LeanResource, viewerId: string) {
  const upvotes = (resource.upvotes as Array<{ toString(): string }> | undefined) ?? [];
  return {
    ...resource,
    _id: String(resource._id),
    // The full voter list is not the client's business; one boolean is.
    upvotes: undefined,
    hasUpvoted: upvotes.some((id) => String(id) === viewerId),
    isOwn: String((resource.author as { _id?: unknown })?._id ?? resource.author) === viewerId,
  };
}
