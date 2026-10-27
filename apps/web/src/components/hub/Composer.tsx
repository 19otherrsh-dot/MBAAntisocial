'use client';

import { useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar, Chip } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import type { HubMemberView, HubMessageView } from './types';
import styles from './hub.module.css';

interface Props {
  canSend: boolean;
  cannotSendReason?: string;
  placeholder: string;
  members: HubMemberView[];
  forum?: boolean;
  slowModeSeconds: number;
  replyTo: HubMessageView | null;
  onCancelReply: () => void;
  onTyping: () => void;
  typingNames: string[];
  onSend: (content: string, attachments: HubMessageView['attachments'], title?: string) => Promise<boolean>;
}

const MAX_LENGTH = 4000;

/**
 * Message composer. "@" opens member autocomplete; the visible "@Name" is
 * swapped for a stable `<@id>` token on send, so renames never break old
 * messages. Enter sends, Shift+Enter breaks a line.
 */
export default function Composer({
  canSend,
  cannotSendReason,
  placeholder,
  members,
  forum,
  slowModeSeconds,
  replyTo,
  onCancelReply,
  onTyping,
  typingNames,
  onSend,
}: Props) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [attachments, setAttachments] = useState<HubMessageView['attachments']>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCursor, setMentionCursor] = useState(0);
  const mentionMap = useRef(new Map<string, string>());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!canSend) {
    return (
      <div className={styles.composerWrap}>
        <div className={styles.composerDisabled}>{cannotSendReason ?? 'You can read this channel but not post in it.'}</div>
      </div>
    );
  }

  const options = mentionQuery === null
    ? []
    : members.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8);

  const updateMention = (value: string, caret: number) => {
    const match = /(^|\s)@([\w.]{0,30})$/.exec(value.slice(0, caret));
    setMentionQuery(match ? match[2] : null);
    setMentionCursor(0);
  };

  const pickMention = (member: HubMemberView) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.]{0,30})$/, `@${member.name} `);
    const next = before + text.slice(caret);
    mentionMap.current.set(member.name, member.userId);
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const toTokens = (value: string) => {
    let out = value;
    // Longest names first so "Priya D" wins over "Priya".
    for (const [name, id] of [...mentionMap.current.entries()].sort((a, b) => b[0].length - a[0].length)) {
      out = out.split(`@${name}`).join(`<@${id}>`);
    }
    return out;
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6 - attachments.length)) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'hub');
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message ?? 'Upload failed');
        setAttachments((current) => [...current, { url: body.url, name: body.originalFilename, mime: body.mime, bytes: body.bytes }]);
      }
    } catch (caught) {
      toast.error('Upload failed', caught instanceof Error ? caught.message : undefined);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    const content = toTokens(text.trim());
    if ((!content && attachments.length === 0) || sending || content.length > MAX_LENGTH) return;
    if (forum && !title.trim()) {
      toast.info('Give your post a title first');
      return;
    }
    setSending(true);
    const sent = await onSend(content, attachments, forum ? title.trim() : undefined);
    setSending(false);
    if (sent) {
      setText('');
      setTitle('');
      setAttachments([]);
      mentionMap.current.clear();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (options.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionCursor((c) => (c + 1) % options.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionCursor((c) => (c - 1 + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pickMention(options[mentionCursor]);
        return;
      }
      if (event.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const typingLine =
    typingNames.length === 0
      ? slowModeSeconds > 0
        ? `Slow mode: one message every ${slowModeSeconds}s`
        : ''
      : typingNames.length === 1
        ? `${typingNames[0]} is typing…`
        : typingNames.length < 4
          ? `${typingNames.join(', ')} are typing…`
          : 'Several people are typing…';

  return (
    <div className={styles.composerWrap}>
      {options.length > 0 && (
        <div className={styles.mentionMenu} role="listbox">
          {options.map((member, i) => (
            <button
              key={member.userId}
              role="option"
              aria-selected={i === mentionCursor}
              className={cn(styles.mentionOption, i === mentionCursor && styles.mentionOptionActive)}
              onMouseDown={(e) => {
                e.preventDefault();
                pickMention(member);
              }}
            >
              <Avatar name={member.name} image={member.image} seed={member.userId} size={22} />
              {member.name}
              <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{member.batch}</span>
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div className={styles.replyBar}>
          Replying to <strong>{replyTo.author?.name ?? 'message'}</strong>
          <button onClick={onCancelReply} aria-label="Cancel reply"><X size={13} /></button>
        </div>
      )}

      {forum && (
        <input
          className={styles.composerInput}
          style={{ border: '1px solid var(--line-strong)', borderRadius: 10, marginBottom: 6, width: '100%', padding: '8px 10px', fontWeight: 600 }}
          placeholder="Post title — the question in one line"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      )}

      {attachments.length > 0 && (
        <div className={styles.pendingAttachments}>
          {attachments.map((a) => (
            <Chip key={a.url} outline>
              <Paperclip size={12} /> {a.name}
              <button onClick={() => setAttachments(attachments.filter((x) => x.url !== a.url))} aria-label={`Remove ${a.name}`}><X size={12} /></button>
            </Chip>
          ))}
        </div>
      )}

      <div className={styles.composer}>
        <input ref={fileRef} type="file" hidden multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xlsx,.txt,.md" onChange={(e) => upload(e.target.files)} />
        <Button variant="ghost" size="sm" icon={<Paperclip size={16} />} aria-label="Attach files" onClick={() => fileRef.current?.click()} loading={uploading} />
        <textarea
          ref={inputRef}
          className={styles.composerInput}
          rows={1}
          placeholder={placeholder}
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => {
            setText(e.target.value);
            updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            onTyping();
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(200, e.target.scrollHeight)}px`;
          }}
          onKeyDown={onKeyDown}
          aria-label="Message"
        />
        <Button size="sm" icon={<Send size={16} />} aria-label="Send" onClick={() => void submit()} disabled={(!text.trim() && attachments.length === 0) || sending} />
      </div>
      <div className={styles.composerHint}>{typingLine}</div>
    </div>
  );
}
