'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Reply, MessagesSquare, Pin, PinOff, Pencil, Trash2, SmilePlus, Paperclip, CheckCircle2, CornerUpLeft } from 'lucide-react';
import { QUICK_REACTIONS } from '@mba/shared/hub';
import { Avatar, Chip } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { api, errorMessage } from '@/lib/client/api';
import RichText, { type MentionResolver } from '@/components/RichText';
import { cn } from '@/lib/utils';
import type { HubMessageView } from './types';
import styles from './hub.module.css';

interface Props {
  message: HubMessageView;
  grouped: boolean;
  replyTarget?: HubMessageView;
  resolver: MentionResolver;
  selfId?: string;
  kind: 'channel' | 'dm';
  inThread: boolean;
  isThreadRoot: boolean;
  canModerate: boolean;
  canPin: boolean;
  onReply: () => void;
  onOpenThread?: (message: HubMessageView) => void;
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function MessageItem({
  message,
  grouped,
  replyTarget,
  resolver,
  selfId,
  kind,
  inThread,
  isThreadRoot,
  canModerate,
  canPin,
  onReply,
  onOpenThread,
}: Props) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [picking, setPicking] = useState(false);

  const isMine = Boolean(selfId && message.author?._id === selfId);
  const mentionsMe = Boolean(selfId && (message.mentions.users.includes(selfId) || message.mentions.everyone));
  const authorName = message.author?.name ?? message.viaDiscord?.authorName ?? 'Unknown';

  if (message.system) {
    return (
      <div className={styles.systemLine}>
        <strong>{authorName}</strong> {message.content}
      </div>
    );
  }

  const act = async (fn: () => Promise<unknown>, failure: string) => {
    try {
      await fn();
    } catch (caught) {
      toast.error(failure, errorMessage(caught));
    }
  };

  const react = (emoji: string) => {
    setPicking(false);
    void act(() => api.post(`/api/hub/messages/${message._id}/reactions`, { emoji }), 'Could not react');
  };

  const saveEdit = async () => {
    const content = draft.trim();
    if (!content || content === message.content) return setEditing(false);
    await act(() => api.patch(`/api/hub/messages/${message._id}`, { action: 'edit', content }), 'Could not edit');
    setEditing(false);
  };

  const remove = async () => {
    const ok = await confirm({
      title: isMine ? 'Delete this message?' : 'Hide this message?',
      body: isMine ? 'It is removed for everyone.' : 'Moderators can still review it.',
      confirmLabel: isMine ? 'Delete' : 'Hide',
      destructive: true,
    });
    if (ok) await act(() => api.delete(`/api/hub/messages/${message._id}`), 'Could not remove');
  };

  const removed = message.deleted || (message.hidden && !canModerate);

  return (
    <div
      className={cn(
        styles.message,
        grouped && styles.messageGrouped,
        mentionsMe && !isMine && styles.messageMention,
        message.pending && styles.messagePending
      )}
    >
      <div className={styles.messageGutter}>
        {grouped ? (
          <span className={styles.messageTime}>{time(message.createdAt)}</span>
        ) : message.author ? (
          <Link href={`/u/${message.author._id}`} aria-label={authorName}>
            <Avatar name={authorName} image={message.author.image} seed={message.author._id} size={36} />
          </Link>
        ) : (
          <Avatar name={authorName} image={message.viaDiscord?.authorAvatar} size={36} />
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        {replyTarget && (
          <div className="row gap-1 dim" style={{ fontSize: 'var(--t-xs)' }}>
            <CornerUpLeft size={12} /> <strong>{replyTarget.author?.name ?? 'someone'}</strong>
            <span className="truncate" style={{ maxWidth: 360 }}>{replyTarget.content || 'attachment'}</span>
          </div>
        )}
        <div className={styles.messageMeta}>
          <span className={styles.messageAuthor}>{authorName}</span>
          {message.viaDiscord && <Chip>via Discord</Chip>}
          {message.author?.role === 'alumni' && <Chip tone="violet">Alumni</Chip>}
          {message.author?.role === 'mentor' && <Chip tone="blue">Senior</Chip>}
          <span className={styles.messageStamp}>{time(message.createdAt)}</span>
          {message.pinned && <Pin size={12} className="dim" aria-label="Pinned" />}
          {message.markedUseful && <Chip tone="teal" icon={<CheckCircle2 size={12} />}>Answer</Chip>}
        </div>

        {message.title && <div className={styles.messageTitle}>{message.title}</div>}

        {removed ? (
          <div className={styles.messageRemoved}>{message.deleted ? 'Message deleted.' : 'Hidden by a moderator.'}</div>
        ) : editing ? (
          <div className="stack gap-2">
            <textarea
              className={styles.composerInput}
              style={{ border: '1px solid var(--line-strong)', borderRadius: 8, padding: 8 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Enter to save · Esc to cancel</span>
          </div>
        ) : (
          <div className={styles.messageBody}>
            {message.hidden && canModerate && <Chip tone="rose">Hidden</Chip>} <RichText text={message.content} resolver={{ ...resolver, selfId }} />
            {message.edited && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}> (edited)</span>}
          </div>
        )}

        {!removed && message.attachments.length > 0 && (
          <div className={styles.attachments}>
            {message.attachments.map((a) =>
              a.mime.startsWith('image/') ? (
                <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer">
                  {/* User uploads from our own storage; next/image would need every host allow-listed. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className={styles.attachmentImage} loading="lazy" />
                </a>
              ) : (
                <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className={styles.attachmentFile}>
                  <Paperclip size={14} /> <span className="truncate">{a.name || 'Attachment'}</span>
                </a>
              )
            )}
          </div>
        )}

        {message.reactions.length > 0 && (
          <div className={styles.reactions}>
            {message.reactions.map((r) => (
              <button key={r.emoji} className={cn(styles.reaction, r.mine && styles.reactionMine)} onClick={() => react(r.emoji)} aria-pressed={r.mine}>
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}

        {kind === 'channel' && !inThread && message.threadCount > 0 && onOpenThread && (
          <button className={styles.threadLink} onClick={() => onOpenThread(message)}>
            <MessagesSquare size={13} /> {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {!message.pending && !removed && (
        <div className={styles.messageTools}>
          {picking ? (
            <div className={styles.quickReactions}>
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} className={styles.toolButton} onClick={() => react(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>
              ))}
            </div>
          ) : (
            <>
              <button className={styles.toolButton} onClick={() => setPicking(true)} aria-label="Add reaction" title="React"><SmilePlus size={15} /></button>
              <button className={styles.toolButton} onClick={onReply} aria-label="Reply" title="Reply"><Reply size={15} /></button>
              {kind === 'channel' && !inThread && onOpenThread && (
                <button className={styles.toolButton} onClick={() => onOpenThread(message)} aria-label="Open thread" title="Thread"><MessagesSquare size={15} /></button>
              )}
              {kind === 'channel' && inThread && !isThreadRoot && (
                <button className={styles.toolButton} onClick={() => act(() => api.patch(`/api/hub/messages/${message._id}`, { action: 'useful', value: !message.markedUseful }), 'Could not mark')} aria-label="Mark as answer" title="Mark as the answer"><CheckCircle2 size={15} /></button>
              )}
              {kind === 'channel' && canPin && (
                <button className={styles.toolButton} onClick={() => act(() => api.patch(`/api/hub/messages/${message._id}`, { action: message.pinned ? 'unpin' : 'pin' }), 'Could not pin')} aria-label={message.pinned ? 'Unpin' : 'Pin'} title={message.pinned ? 'Unpin' : 'Pin'}>
                  {message.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                </button>
              )}
              {isMine && !message.viaDiscord && (
                <button className={styles.toolButton} onClick={() => { setDraft(message.content); setEditing(true); }} aria-label="Edit" title="Edit"><Pencil size={15} /></button>
              )}
              {(isMine || canModerate) && (
                <button className={cn(styles.toolButton, styles.toolDanger)} onClick={remove} aria-label="Delete" title={isMine ? 'Delete' : 'Hide'}><Trash2 size={15} /></button>
              )}
            </>
          )}
        </div>
      )}
      {dialog}
    </div>
  );
}
