'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useTopic, useTyping, isEvent } from '@/lib/client/realtime';
import { useMe } from '@/lib/client/me';
import type { MentionResolver } from '@/components/RichText';
import MessageItem from './MessageItem';
import Composer from './Composer';
import type { HubMemberView, HubMessageView } from './types';
import styles from './hub.module.css';

export interface ConversationTarget {
  /** GET + POST endpoint for messages. */
  endpoint: string;
  topic: string;
  readTarget: { targetId: string; kind: 'channel' | 'conversation' };
  /** Channel features (threads, pins, moderation) vs plain DM. */
  kind: 'channel' | 'dm';
  title: string;
  /** Short name for screen readers ("#general", a DM's name); defaults to the title. */
  label?: string;
  canSend: boolean;
  cannotSendReason?: string;
  forum?: boolean;
  thread?: string;
  canModerate?: boolean;
  canPin?: boolean;
  slowModeSeconds?: number;
  placeholder: string;
}

interface Props {
  target: ConversationTarget;
  members: HubMemberView[];
  resolver: MentionResolver;
  onOpenThread?: (message: HubMessageView) => void;
  intro?: React.ReactNode;
  /** Called after the timeline has been marked read on the server. */
  onRead?: () => void;
}

const PAGE = 50;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * A live message timeline with a composer: used for channels, threads, and
 * DMs. New messages arrive over the realtime socket; the initial page and
 * older pages come from the API.
 */
export default function Conversation({ target, members, resolver, onOpenThread, intro, onRead }: Props) {
  const toast = useToast();
  const { me } = useMe();
  const [older, setOlder] = useState<HubMessageView[]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<HubMessageView | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const query = useMemo(() => (target.thread ? { thread: target.thread, limit: 100 } : { limit: PAGE }), [target.thread]);
  const { data, loading, error, mutate } = useApiQuery<{ messages: HubMessageView[]; hasMore: boolean; conversation?: unknown }>(target.endpoint, query);
  const messages = useMemo(() => [...older, ...(data?.messages ?? [])], [older, data]);
  const hasMore = !target.thread && !olderExhausted && Boolean(data?.hasMore);

  const upsert = useCallback(
    (message: HubMessageView) => {
      mutate((current) => {
        const list = current.messages.filter((m) => !(m.pending && m.content === message.content && m.author?._id === message.author?._id));
        const exists = list.some((m) => m._id === message._id);
        return { ...current, messages: exists ? list.map((m) => (m._id === message._id ? message : m)) : [...list, message] };
      });
    },
    [mutate]
  );

  // Live updates. Thread replies show in the thread pane, not the main timeline.
  useTopic(target.topic, (envelope) => {
    if (isEvent(envelope, 'hub.message.created') || isEvent(envelope, 'dm.message.created')) {
      const message = envelope.data.message as HubMessageView;
      const belongsHere = target.thread ? message.thread === target.thread || message._id === target.thread : !message.thread;
      if (belongsHere) upsert({ ...message, reactions: message.reactions.map((r) => ({ ...r, mine: false })) });
      else if (!target.thread && message.thread) {
        // A reply landed in a thread: bump the root's counter.
        mutate((current) => ({
          ...current,
          messages: current.messages.map((m) => (m._id === message.thread ? { ...m, threadCount: m.threadCount + 1, lastThreadAt: message.createdAt } : m)),
        }));
      }
    } else if (isEvent(envelope, 'hub.message.updated') || isEvent(envelope, 'dm.message.updated')) {
      const message = envelope.data.message as HubMessageView;
      mutate((current) => ({ ...current, messages: current.messages.map((m) => (m._id === message._id ? { ...message, reactions: m.reactions } : m)) }));
      setOlder((current) => current.map((m) => (m._id === message._id ? { ...message, reactions: m.reactions } : m)));
    } else if (isEvent(envelope, 'hub.message.deleted')) {
      const { messageId } = envelope.data;
      const strip = (m: HubMessageView) => (m._id === messageId ? { ...m, deleted: true, content: '', attachments: [] } : m);
      mutate((current) => ({ ...current, messages: current.messages.map(strip) }));
      setOlder((current) => current.map(strip));
    } else if (isEvent(envelope, 'hub.reaction')) {
      const { messageId, reactions } = envelope.data;
      const apply = (m: HubMessageView) =>
        m._id === messageId ? { ...m, reactions: reactions.map((r) => ({ emoji: r.emoji, count: r.count, mine: r.userIds.includes(me?.id ?? '') })) } : m;
      mutate((current) => ({ ...current, messages: current.messages.map(apply) }));
      setOlder((current) => current.map(apply));
    }
  });

  const typing = useTyping(target.topic, me?.id);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Reading the latest message marks the channel read.
  const latestId = data?.messages[data.messages.length - 1]?._id;
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  });
  const { targetId: readId, kind: readKind } = target.readTarget;
  useEffect(() => {
    if (!latestId || target.thread) return;
    api
      .post('/api/hub/read', { targetId: readId, kind: readKind })
      .then(() => onReadRef.current?.())
      .catch(() => undefined);
  }, [latestId, readId, readKind, target.thread]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    try {
      const page = await api.get<{ messages: HubMessageView[]; hasMore: boolean }>(target.endpoint, { before: first.createdAt, limit: PAGE });
      setOlder((current) => [...page.messages, ...current]);
      if (!page.hasMore) setOlderExhausted(true);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - previousHeight;
      });
    } catch (caught) {
      toast.error('Could not load older messages', errorMessage(caught));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (content: string, attachments: HubMessageView['attachments'], title?: string) => {
    const optimistic: HubMessageView = {
      _id: `pending-${Math.random().toString(36).slice(2)}`,
      author: me ? { _id: me.id, name: me.name, image: me.image } : null,
      content,
      attachments,
      mentions: { users: [], roles: [], everyone: false },
      thread: target.thread,
      replyTo: replyTo?._id,
      threadCount: 0,
      title: title ?? '',
      reactions: [],
      pinned: false,
      edited: false,
      deleted: false,
      hidden: false,
      system: false,
      markedUseful: false,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    stickToBottom.current = true;
    mutate((current) => ({ ...current, messages: [...current.messages, optimistic] }));
    const reply = replyTo;
    setReplyTo(null);
    try {
      const { message } = await api.post<{ message: HubMessageView }>(target.endpoint, {
        content,
        attachments,
        ...(target.thread ? { thread: target.thread } : {}),
        ...(reply ? { replyTo: reply._id } : {}),
        ...(title ? { title } : {}),
      });
      mutate((current) => ({
        ...current,
        messages: current.messages.filter((m) => m._id !== optimistic._id).some((m) => m._id === message._id)
          ? current.messages.filter((m) => m._id !== optimistic._id)
          : current.messages.map((m) => (m._id === optimistic._id ? message : m)),
      }));
      return true;
    } catch (caught) {
      mutate((current) => ({ ...current, messages: current.messages.filter((m) => m._id !== optimistic._id) }));
      toast.error('Not sent', errorMessage(caught));
      return false;
    }
  };

  const byId = useMemo(() => new Map(messages.map((m) => [m._id, m])), [messages]);

  // Keyboard: the timeline is one tab stop (the last focused message, else the newest);
  // arrows move between messages, Escape goes to the composer.
  const [activeId, setActiveId] = useState<string | null>(null);
  const focusable = messages.filter((m) => !m.system);
  const tabStopId = activeId && byId.has(activeId) ? activeId : (focusable.at(-1)?._id ?? null);
  const onTimelineKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.dataset.messageId) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-message-id]')];
    const at = items.indexOf(target);
    const go = (index: number) => {
      const next = items[Math.max(0, Math.min(items.length - 1, index))];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    };
    if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.parentElement?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    }
  };

  let lastDay = '';
  let lastAuthor = '';
  let lastTime = 0;

  return (
    <>
      <div
        className={styles.timeline}
        ref={scrollRef}
        role="log"
        aria-label={target.thread ? 'Thread messages' : `Messages in ${target.label ?? target.title}`}
        aria-busy={loading || loadingOlder}
        onKeyDown={onTimelineKey}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {!hasMore && !loading && (
          <div className={styles.timelineStart}>
            <MessageSquareText size={32} style={{ color: 'var(--accent)' }} />
            <div className={styles.timelineStartTitle}>{target.thread ? 'Thread' : target.title}</div>
            {intro}
          </div>
        )}
        {hasMore && (
          <Button size="sm" variant="ghost" className={styles.loadMore} onClick={loadOlder} loading={loadingOlder}>
            Load older messages
          </Button>
        )}
        {loading && <div className="skeleton" style={{ height: 120, margin: 16 }} />}
        {error && <div style={{ padding: 16, color: 'var(--danger)' }}>{error}</div>}
        {messages.map((message) => {
          const day = dayLabel(message.createdAt);
          const time = new Date(message.createdAt).getTime();
          const authorKey = message.author?._id ?? message.viaDiscord?.authorName ?? '';
          const grouped = day === lastDay && authorKey === lastAuthor && time - lastTime < 5 * 60_000 && !message.system && !message.replyTo && !message.title;
          const divider = day !== lastDay ? <div className={styles.dayDivider}>{day}</div> : null;
          lastDay = day;
          lastAuthor = message.system ? '' : authorKey;
          lastTime = time;
          return (
            <div key={message._id}>
              {divider}
              <MessageItem
                message={message}
                grouped={grouped}
                replyTarget={message.replyTo ? byId.get(message.replyTo) : undefined}
                resolver={resolver}
                selfId={me?.id}
                kind={target.kind}
                inThread={Boolean(target.thread)}
                canModerate={Boolean(target.canModerate)}
                canPin={Boolean(target.canPin)}
                isThreadRoot={target.thread === message._id}
                onReply={() => setReplyTo(message)}
                onOpenThread={onOpenThread}
                tabStop={message._id === tabStopId}
                onFocusMessage={() => setActiveId(message._id)}
              />
            </div>
          );
        })}
      </div>

      <Composer
        canSend={target.canSend}
        cannotSendReason={target.cannotSendReason}
        placeholder={target.placeholder}
        members={members}
        forum={target.forum && !target.thread}
        slowModeSeconds={target.slowModeSeconds ?? 0}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onTyping={typing.notifyTyping}
        typingNames={typing.names}
        onSend={send}
      />
    </>
  );
}
