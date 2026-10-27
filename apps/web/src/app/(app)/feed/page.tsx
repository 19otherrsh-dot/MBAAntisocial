'use client';

import { useMemo, useState } from 'react';
import {
  Send,
  MessagesSquare,
  Link2,
  Flag,
  CheckCircle2,
  Trash2,
  MessageCircle,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Select, Textarea } from '@/components/ui/Field';
import { Avatar, Chip, EmptyState, Segmented, Banner } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import {
  POST_CATEGORIES,
  POST_CATEGORY_META,
  REACTION_KINDS,
  REACTION_META,
  REPORT_REASONS,
  REPORT_REASON_META,
  MAX_POST_LENGTH,
  type PostCategory,
  type ReactionKind,
  type ReportReason,
} from '@/lib/constants';
import { cn, hostnameOf, timeAgo } from '@/lib/utils';
import styles from '../app.module.css';

interface Author {
  _id: string;
  name: string;
  image?: string;
  year?: 1 | 2;
  batch?: string;
  campus?: string;
}

interface Comment {
  _id: string;
  author: Author;
  content: string;
  markedUseful: boolean;
  createdAt: string;
}

interface Post {
  _id: string;
  author: Author;
  content: string;
  category: PostCategory;
  links: string[];
  reactions: Record<ReactionKind, number>;
  myReactions: Record<ReactionKind, boolean>;
  comments: Comment[];
  commentCount: number;
  resolvedAt?: string;
  isOwn: boolean;
  createdAt: string;
}

export default function FeedPage() {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { me } = useMe();

  const [category, setCategory] = useState<PostCategory | 'all'>('all');
  const [scope, setScope] = useState<'campus' | 'global'>('campus');
  const [reportTarget, setReportTarget] = useState<{ type: 'post' | 'comment'; id: string; parent?: string } | null>(null);

  const query = useMemo(() => ({ category, scope }), [category, scope]);
  const { data, loading, error, refetch, mutate } = useApiQuery<{ posts: Post[] }>('/api/feed', query);

  const posts = data?.posts ?? [];

  const react = async (post: Post, reaction: ReactionKind) => {
    const active = post.myReactions[reaction];

    mutate((current) => ({
      posts: current.posts.map((row) =>
        row._id === post._id
          ? {
              ...row,
              myReactions: { ...row.myReactions, [reaction]: !active },
              reactions: { ...row.reactions, [reaction]: row.reactions[reaction] + (active ? -1 : 1) },
            }
          : row
      ),
    }));

    try {
      await api.patch('/api/feed', { action: 'react', postId: post._id, reaction });
    } catch {
      mutate((current) => ({
        posts: current.posts.map((row) => (row._id === post._id ? post : row)),
      }));
    }
  };

  const comment = async (post: Post, content: string) => {
    try {
      const result = await api.patch<{ post: Post }>('/api/feed', {
        action: 'comment',
        postId: post._id,
        content,
      });
      mutate((current) => ({
        posts: current.posts.map((row) => (row._id === post._id ? result.post : row)),
      }));
    } catch (caught) {
      toast.error('Could not post that', caught instanceof Error ? caught.message : undefined);
    }
  };

  const markUseful = async (post: Post, commentId: string) => {
    try {
      await api.patch('/api/feed', { action: 'mark_useful', postId: post._id, commentId });
      refetch();
    } catch (caught) {
      toast.error('Could not mark that', caught instanceof Error ? caught.message : undefined);
    }
  };

  const remove = async (post: Post) => {
    const confirmed = await confirm({
      title: 'Delete this post?',
      body: 'It disappears for everyone, replies included.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await api.patch('/api/feed', { action: 'delete', postId: post._id });
      mutate((current) => ({ posts: current.posts.filter((row) => row._id !== post._id) }));
      toast.success('Deleted');
    } catch (caught) {
      toast.error('Could not delete', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <div className={styles.feedColumn}>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>{me?.campus ?? 'Campus'} feed</h2>
          <p className={styles.pageSubtitle}>
            Newest first, your campus only. No ranking, no infinite scroll.
          </p>
        </div>
      </div>

      <Composer onPosted={refetch} />

      <Segmented
        ariaLabel="Feed Scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'campus', label: 'My Campus' },
          { value: 'global', label: 'Global (All Campuses)' },
        ]}
      />

      <div style={{ marginTop: '16px' }}>
        <Segmented
          ariaLabel="Filter feed"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all' as const, label: 'Everything' },
            ...POST_CATEGORIES.map((value) => ({ value, label: POST_CATEGORY_META[value].label })),
          ]}
        />
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.cardList}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn('skeleton', styles.skeletonWide)} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          art={<MessagesSquare size={40} strokeWidth={1.4} />}
          title="Nothing here yet"
          body="Ask the question everyone else is also too embarrassed to ask. That is what this is for."
        />
      ) : (
        <div className={styles.cardList}>
          {posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              onReact={react}
              onComment={comment}
              onMarkUseful={markUseful}
              onDelete={remove}
              onReport={(target) => setReportTarget(target)}
            />
          ))}
        </div>
      )}

      <ReportDialog
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onDone={() => {
          setReportTarget(null);
          toast.success('Reported', 'A campus moderator will take a look.');
        }}
      />

      {confirmDialog}
    </div>
  );
}

/* ───────────────────────── Composer ───────────────────────── */

function Composer({ onPosted }: { onPosted: () => void }) {
  const toast = useToast();
  const { me } = useMe();

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('general');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setPending(true);
    try {
      await api.post('/api/feed', { content: trimmed, category, links: [] });
      setContent('');
      setCategory('general');
      onPosted();
    } catch (caught) {
      toast.error('Could not post', caught instanceof Error ? caught.message : undefined);
    } finally {
      setPending(false);
    }
  };

  const over = content.length > MAX_POST_LENGTH;

  return (
    <div className={styles.composer}>
      <div className={styles.composerRow}>
        <Avatar name={me?.name ?? '?'} image={me?.image} seed={me?.id} size={34} />
        <textarea
          className={styles.composerInput}
          placeholder="Ask something, share something, or admit you also have no idea what a 'guesstimate' is."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={content.length > 90 ? 4 : 2}
          maxLength={MAX_POST_LENGTH + 200}
          aria-label="Write a post"
        />
      </div>

      <div className={styles.composerFoot}>
        <Select
          aria-label="Post category"
          value={category}
          onChange={(event) => setCategory(event.target.value as PostCategory)}
          options={POST_CATEGORIES.map((value) => ({
            value,
            label: POST_CATEGORY_META[value].label,
          }))}
        />

        <div className="row gap-3" style={{ marginLeft: 'auto' }}>
          {content.length > MAX_POST_LENGTH - 200 && (
            <span
              className="dim tnum"
              style={{ fontSize: 'var(--t-xs)', color: over ? 'var(--danger)' : undefined }}
            >
              {content.length}/{MAX_POST_LENGTH}
            </span>
          )}
          <Button
            size="sm"
            icon={<Send size={14} />}
            onClick={submit}
            loading={pending}
            disabled={!content.trim() || over}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Post ───────────────────────── */

function PostCard({
  post,
  onReact,
  onComment,
  onMarkUseful,
  onDelete,
  onReport,
}: {
  post: Post;
  onReact: (post: Post, reaction: ReactionKind) => void;
  onComment: (post: Post, content: string) => void;
  onMarkUseful: (post: Post, commentId: string) => void;
  onDelete: (post: Post) => void;
  onReport: (target: { type: 'post' | 'comment'; id: string; parent?: string }) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [draft, setDraft] = useState('');

  const meta = POST_CATEGORY_META[post.category];

  const submitComment = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onComment(post, trimmed);
    setDraft('');
  };

  return (
    <article className={styles.postCard}>
      <div className={styles.postHead}>
        <Avatar name={post.author?.name ?? '?'} image={post.author?.image} seed={post.author?._id} size={36} />
        <div className={styles.postAuthor}>
          <span className={styles.postName}>
            {post.author?.name}
            {post.author?.year === 2 && <Chip tone="violet">Senior</Chip>}
            {post.author?.campus && <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>• {post.author.campus}</span>}
          </span>
          <span className={styles.postTime}>{timeAgo(post.createdAt)}</span>
        </div>
        <div className="row gap-2">
          <Chip tone={meta.tone}>{meta.label}</Chip>
          {post.resolvedAt && (
            <Chip tone="teal" icon={<CheckCircle2 size={11} />}>
              Answered
            </Chip>
          )}
        </div>
      </div>

      <p className={styles.postBody}>{post.content}</p>

      {post.links.length > 0 && (
        <div className={styles.postLinks}>
          {post.links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={styles.postLink}
            >
              <Link2 size={14} />
              {hostnameOf(link)}
            </a>
          ))}
        </div>
      )}

      <div className={styles.reactionBar}>
        {REACTION_KINDS.map((kind) => (
          <button
            key={kind}
            className={cn(styles.reactionBtn, post.myReactions[kind] && styles.reactionActive)}
            onClick={() => onReact(post, kind)}
            aria-pressed={post.myReactions[kind]}
          >
            {REACTION_META[kind].label}
            {post.reactions[kind] > 0 && <span>{post.reactions[kind]}</span>}
          </button>
        ))}

        <button
          className={styles.reactionBtn}
          onClick={() => setShowComments((value) => !value)}
          aria-expanded={showComments}
        >
          <MessageCircle size={13} />
          {post.commentCount > 0 ? post.commentCount : 'Reply'}
        </button>

        <div className="row gap-1" style={{ marginLeft: 'auto' }}>
          {post.isOwn ? (
            <button
              className={styles.commentAction}
              onClick={() => onDelete(post)}
              aria-label="Delete post"
            >
              <Trash2 size={13} />
            </button>
          ) : (
            <button
              className={styles.commentAction}
              onClick={() => onReport({ type: 'post', id: post._id })}
              aria-label="Report post"
              title="Report"
            >
              <Flag size={13} />
            </button>
          )}
        </div>
      </div>

      {showComments && (
        <div className={styles.commentList}>
          {post.comments.map((entry) => (
            <div key={entry._id} className={styles.comment}>
              <Avatar
                name={entry.author?.name ?? '?'}
                image={entry.author?.image}
                seed={entry.author?._id}
                size={26}
              />
              <div className={cn(styles.commentBubble, entry.markedUseful && styles.commentUseful)}>
                <div className={styles.commentName}>{entry.author?.name}</div>
                <p className={styles.commentText}>{entry.content}</p>
                <div className={styles.commentFoot}>
                  <span className={styles.commentTime}>{timeAgo(entry.createdAt)}</span>
                  {post.isOwn && (
                    <button
                      className={styles.commentAction}
                      onClick={() => onMarkUseful(post, entry._id)}
                    >
                      {entry.markedUseful ? 'Unmark' : 'This helped'}
                    </button>
                  )}
                  {!post.isOwn && (
                    <button
                      className={styles.commentAction}
                      onClick={() => onReport({ type: 'comment', id: entry._id, parent: post._id })}
                    >
                      Report
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <form className={styles.commentForm} onSubmit={submitComment}>
            <input
              className={styles.commentInput}
              placeholder="Say something useful"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={800}
              aria-label="Write a reply"
            />
            <Button size="sm" type="submit" disabled={!draft.trim()} icon={<Send size={14} />} />
          </form>
        </div>
      )}
    </article>
  );
}

/* ───────────────────────── Report ───────────────────────── */

function ReportDialog({
  target,
  onClose,
  onDone,
}: {
  target: { type: 'post' | 'comment'; id: string; parent?: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [detail, setDetail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api.post('/api/reports', {
        targetType: target.type,
        target: target.id,
        parent: target.parent,
        reason,
        detail: detail.trim(),
      });
      setDetail('');
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send that.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Report this"
      description="A moderator from your campus reviews it. You will hear back either way."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={pending}>
            Send report
          </Button>
        </>
      }
    >
      {error && <Banner variant="danger">{error}</Banner>}

      <Select
        label="What is wrong with it?"
        value={reason}
        onChange={(event) => setReason(event.target.value as ReportReason)}
        options={REPORT_REASONS.map((value) => ({
          value,
          label: REPORT_REASON_META[value].label,
        }))}
      />

      <Textarea
        label="Anything else we should know?"
        placeholder="Context helps a moderator make the right call."
        value={detail}
        onChange={(event) => setDetail(event.target.value)}
        maxLength={1000}
        rows={3}
        optional
      />
    </Dialog>
  );
}
