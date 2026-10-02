import { route, ok, created, paginate, pageMeta } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createPostSchema, postActionSchema, feedQuerySchema } from '@/lib/validation';
import { award } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import Post from '@/models/Post';
import { REACTION_KINDS, type ReactionKind } from '@/lib/constants';
import type { QueryFilter } from 'mongoose';
import type { IPost } from '@/models/Post';

const AUTHOR_FIELDS = 'name image year batch role campus';

/**
 * The campus feed.
 *
 * Scoped to the caller's campus and ordered strictly by recency. There is no
 * engagement ranking on purpose: §16 rules out the comparison-driven feed
 * mechanics that make a highlight reel, and a small campus feed does not need
 * an algorithm to be worth reading.
 */
export const GET = route({ query: feedQuerySchema }, async ({ actor, query }) => {
  const { skip, limit } = paginate(query);

  const filter: QueryFilter<IPost> = {
    hiddenAt: { $exists: false },
  };
  if (query.scope === 'campus') {
    filter.campus = actor.campus;
  }
  if (query.category !== 'all') filter.category = query.category;

  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .populate('comments.author', AUTHOR_FIELDS)
      .lean(),
    Post.countDocuments(filter),
  ]);

  return ok({
    posts: posts.map((post) => serialisePost(post, actor.id)),
    pagination: pageMeta(query, total),
  });
});

export const POST = route({ body: createPostSchema, rateLimit: 'post' }, async ({ actor, body }) => {
  const post = await Post.create({
    author: actor.id,
    campus: actor.campus,
    batch: actor.batch,
    content: body.content,
    category: body.category,
    links: body.links,
  });

  await award(actor.id, 'post_created', { entityType: 'post', entity: post._id });

  const populated = await Post.findById(post._id).populate('author', AUTHOR_FIELDS).lean();

  return created({ post: serialisePost(populated!, actor.id) });
});

export const PATCH = route({ body: postActionSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const post = await Post.findOne({
    _id: body.postId,
    campus: actor.campus,
    hiddenAt: { $exists: false },
  });
  if (!post) throw ApiError.notFound('That post is not available.');

  switch (body.action) {
    case 'react': {
      const voters = post.reactions.get(body.reaction) ?? [];
      const index = voters.findIndex((id) => id.toString() === actor.id);

      if (index > -1) voters.splice(index, 1);
      else voters.push(actor.id as never);

      post.reactions.set(body.reaction, voters);
      post.markModified('reactions');
      await post.save();

      return ok({ reaction: body.reaction, active: index === -1, count: voters.length });
    }

    case 'comment': {
      post.comments.push({ author: actor.id, content: body.content, markedUseful: false } as never);
      post.commentCount = post.comments.filter((c) => !c.hiddenAt).length;
      await post.save();

      await notify({
        user: post.author,
        kind: 'post_reply',
        title: `${actor.name} replied to your post`,
        body: body.content.slice(0, 160),
        href: '/feed',
        entityType: 'post',
        entity: post._id,
        actor: actor.id,
      });

      const populated = await Post.findById(post._id)
        .populate('author', AUTHOR_FIELDS)
        .populate('comments.author', AUTHOR_FIELDS)
        .lean();

      return ok({ post: serialisePost(populated!, actor.id) });
    }

    case 'mark_useful': {
      // Only the person who asked can say what answered it.
      if (post.author.toString() !== actor.id) {
        throw ApiError.forbidden('Only the poster can mark a reply as useful.');
      }

      const comment = post.comments.find((c) => String(c._id) === body.commentId);
      if (!comment) throw ApiError.notFound('That reply no longer exists.');

      comment.markedUseful = !comment.markedUseful;
      await post.save();

      if (comment.markedUseful) {
        await award(comment.author.toString(), 'answer_marked_useful', {
          entityType: 'comment',
          entity: comment._id,
        });
      }

      return ok({ commentId: String(comment._id), markedUseful: comment.markedUseful });
    }

    case 'resolve': {
      if (post.author.toString() !== actor.id) {
        throw ApiError.forbidden('Only the poster can close a question.');
      }
      post.resolvedAt = post.resolvedAt ? undefined : new Date();
      await post.save();
      return ok({ resolvedAt: post.resolvedAt ?? null });
    }

    case 'delete': {
      // Authors delete their own; moderators hide via the moderation endpoint,
      // which keeps the record for the report trail.
      if (post.author.toString() !== actor.id) {
        throw ApiError.forbidden('That is not your post.');
      }
      await post.deleteOne();
      return ok({ deleted: true });
    }
  }
});

/** Lean post with reference and Map fields widened to cover populated documents. */
type LeanPost = Omit<IPost, 'author' | 'reactions' | 'comments'> & {
  _id: unknown;
  author: unknown;
  reactions?: unknown;
  comments?: unknown;
};

function serialisePost(post: LeanPost, viewerId: string) {
  const reactions = toReactionMap(post.reactions);

  const counts = {} as Record<ReactionKind, number>;
  const mine = {} as Record<ReactionKind, boolean>;

  for (const kind of REACTION_KINDS) {
    const voters = reactions[kind] ?? [];
    counts[kind] = voters.length;
    mine[kind] = voters.includes(viewerId);
  }

  const comments = ((post.comments as Array<Record<string, unknown>>) ?? [])
    .filter((comment) => !comment.hiddenAt)
    .map((comment) => ({ ...comment, _id: String(comment._id) }));

  return {
    ...post,
    _id: String(post._id),
    // Voter identities are not published; the feed only needs counts and
    // whether the viewer is among them.
    reactions: counts,
    myReactions: mine,
    comments,
    commentCount: comments.length,
    isOwn: String((post.author as { _id?: unknown })?._id ?? post.author) === viewerId,
  };
}

/** Lean documents surface Maps as plain objects; both shapes are handled. */
function toReactionMap(value: unknown): Record<string, string[]> {
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, ids]) => [key, (ids as unknown[]).map(String)])
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown[]>).map(([key, ids]) => [
        key,
        (ids ?? []).map(String),
      ])
    );
  }
  return {};
}
