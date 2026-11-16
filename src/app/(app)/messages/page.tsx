'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { useMe } from '@/lib/client/me';
import { useApiQuery } from '@/lib/client/hooks';
import { useRealtime } from '@/lib/client/realtime';
import { api, errorMessage } from '@/lib/client/api';
import { userChannel } from '@/lib/realtime';
import { Avatar } from '@/components/ui/Display';
import Button from '@/components/ui/Button';
import { cn, timeAgo } from '@/lib/utils';
import chat from '../chat.module.css';

interface Conversation {
  user: { _id: string; name: string; image?: string };
  lastMessage: string;
  time: string;
  unread: boolean;
  unreadCount: number;
}

interface Message {
  _id: string;
  sender: string;
  receiver: string;
  content: string;
  createdAt: string;
  /** Local-only: the send was refused or never reached the server. */
  failed?: string;
}

interface Thread {
  peer: { _id: string; name: string; image: string; year: 1 | 2; role: string };
  reason: 'completed_session' | 'existing_thread' | 'open_to_contact' | 'moderator';
  messages: Message[];
}

const REASON_LABEL: Record<Thread['reason'], string> = {
  completed_session: 'You completed a session together',
  existing_thread: 'They messaged you',
  open_to_contact: 'They posted an opportunity inviting contact',
  moderator: 'Moderator conversation',
};

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export default function MessagesPage() {
  // `useSearchParams` needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
      <Messages />
    </Suspense>
  );
}

function Messages() {
  const { me, unreadMessages, setUnreadMessages } = useMe();
  const router = useRouter();
  const searchParams = useSearchParams();

  /*
   * The open conversation lives in the URL (`?peer=<id>`), not in component
   * state. That is what lets a "Message" button anywhere in the app link
   * straight into a thread — including one that has no messages yet.
   */
  const peerParam = searchParams.get('peer');
  const peerId = peerParam && OBJECT_ID.test(peerParam) ? peerParam : null;

  const list = useApiQuery<{ conversations: Conversation[] }>('/api/messages');
  const thread = useApiQuery<Thread>(peerId ? '/api/messages' : null, { peerId });

  // `?draft=` pre-fills the composer when a page links in to start a thread.
  const [draft, setDraft] = useState(() => (searchParams.get('draft') ?? '').slice(0, 2000));
  // Messages added since the thread loaded: sent here, or arrived over the socket.
  const [extra, setExtra] = useState<{ peerId: string; messages: Message[] }>({ peerId: '', messages: [] });
  const bottomRef = useRef<HTMLDivElement>(null);
  const localSeq = useRef(0);

  const appended = extra.peerId === peerId ? extra.messages : [];
  const loaded = thread.data?.messages ?? [];
  const seen = new Set(loaded.map((message) => message._id));
  const messages = [...loaded, ...appended.filter((message) => !seen.has(message._id))];

  const append = (target: string, message: Message) =>
    setExtra((current) => ({
      peerId: target,
      messages: [...(current.peerId === target ? current.messages : []), message],
    }));

  const open = (id: string | null) => {
    // Opening a thread reads it; take its count off the badge straight away.
    const opened = list.data?.conversations.find((conversation) => conversation.user._id === id);
    if (opened?.unreadCount) setUnreadMessages(unreadMessages - opened.unreadCount);
    setDraft('');
    router.push(id ? `/messages?peer=${id}` : '/messages', { scroll: false });
  };

  const refetchList = list.refetch;
  useRealtime<Message>(me ? userChannel(me.id) : null, 'new-message', (message) => {
    if (message.sender === peerId) append(message.sender, message);
    else setUnreadMessages(unreadMessages + 1);
    refetchList();
  });

  const messageCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount, peerId]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !peerId || !me) return;
    setDraft('');

    try {
      const saved = await api.post<Message>('/api/messages', { receiverId: peerId, content });
      append(peerId, saved);
      refetchList();
    } catch (caught) {
      // Shown in place, marked as unsent — not silently dropped, and not left
      // looking as though it was delivered.
      append(peerId, {
        _id: `local-${(localSeq.current += 1)}`,
        sender: me.id,
        receiver: peerId,
        content,
        createdAt: new Date().toISOString(),
        failed: errorMessage(caught) || 'Not sent.',
      });
    }
  };

  const conversations = list.data?.conversations ?? [];
  const peer = thread.data?.peer;

  return (
    <div className={cn(chat.shell, peerId && chat.shellOpen)}>
      <aside className={chat.list}>
        <div className={chat.listHead}>Messages</div>
        <div className={chat.listBody}>
          {list.loading ? (
            <div className="skeleton" style={{ height: 64 }} />
          ) : conversations.length === 0 ? (
            <p className={chat.listHint}>
              No conversations yet. Messaging opens with someone once you have completed a session
              together, or when they post an opportunity inviting contact.{' '}
              <Link href="/sessions">Find a slot</Link>
            </p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.user._id}
                type="button"
                className={cn(
                  chat.peer,
                  peerId === conversation.user._id && chat.peerActive,
                  conversation.unread && peerId !== conversation.user._id && chat.peerUnread
                )}
                onClick={() => open(conversation.user._id)}
              >
                <Avatar
                  name={conversation.user.name}
                  image={conversation.user.image}
                  seed={conversation.user._id}
                  size={38}
                />
                <span className={chat.peerText}>
                  <span className={chat.peerName}>{conversation.user.name}</span>
                  <span className={cn(chat.peerLast, 'truncate')} style={{ display: 'block' }}>
                    {conversation.lastMessage}
                  </span>
                </span>
                {conversation.unread && peerId !== conversation.user._id && (
                  <span className={chat.unreadDot} aria-label="Unread" />
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      <section className={chat.thread}>
        {!peerId ? (
          <div className={chat.placeholder}>
            <strong>Pick a conversation</strong>
            <p>
              There are no cold DMs here on purpose. A thread opens after a completed session, or
              from an opportunity someone posted.
            </p>
          </div>
        ) : thread.error ? (
          <div className={chat.placeholder}>
            <strong>This conversation is not open yet</strong>
            <p>{thread.error}</p>
            <Button variant="secondary" onClick={() => open(null)}>
              Back to messages
            </Button>
          </div>
        ) : (
          <>
            <header className={chat.threadHead}>
              <button type="button" className={chat.back} onClick={() => open(null)} aria-label="Back to conversations">
                <ArrowLeft size={18} />
              </button>
              {peer ? (
                <>
                  <Avatar name={peer.name} image={peer.image} seed={peer._id} size={32} />
                  <div>
                    <div className={chat.threadTitle}>{peer.name}</div>
                    <div className={chat.threadSub}>{REASON_LABEL[thread.data!.reason]}</div>
                  </div>
                </>
              ) : (
                <div className="skeleton" style={{ height: 32, width: 180 }} />
              )}
            </header>

            <div className={chat.stream} aria-live="polite">
              {thread.loading ? (
                <div className="skeleton" style={{ height: 96 }} />
              ) : messages.length === 0 ? (
                <div className={chat.placeholder}>
                  <strong>Say hello</strong>
                  <p>Nothing here yet. Keep the first message specific — it gets a better reply.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const mine = message.sender === me?.id;
                  return (
                    <div key={message._id} className={cn(chat.msg, mine && chat.msgMine)}>
                      <div
                        className={cn(chat.bubble, message.failed && chat.bubbleFailed)}
                        title={timeAgo(message.createdAt)}
                      >
                        {message.content}
                      </div>
                      {message.failed && <span className={chat.msgNote}>Not sent — {message.failed}</span>}
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form
              className={chat.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <textarea
                className={chat.composerInput}
                rows={1}
                value={draft}
                maxLength={2000}
                placeholder="Write a message"
                aria-label="Message"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <Button type="submit" icon={<Send size={16} />} disabled={!draft.trim() || !peer}>
                Send
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
