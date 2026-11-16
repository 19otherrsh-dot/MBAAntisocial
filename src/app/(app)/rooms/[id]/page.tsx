'use client';

import { useState, useEffect, useMemo, useRef, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Globe2, Send } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar, Chip } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import { useRealtime } from '@/lib/client/realtime';
import { api, errorMessage } from '@/lib/client/api';
import { roomChannel } from '@/lib/realtime';
import { useMe } from '@/lib/client/me';
import { cn, timeAgo, formatDayLabel, formatTime } from '@/lib/utils';
import chat from '../../chat.module.css';

interface Room {
  _id: string;
  title: string;
  topic: string;
  isGlobal: boolean;
  expiresAt: string;
}

interface Message {
  _id: string;
  content: string;
  createdAt: string;
  author: {
    _id: string;
    name: string;
    image: string;
    badges: string[];
  };
}

interface RoomData {
  room: Room;
  messages: Message[];
}

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const { data, loading, error } = useApiQuery<RoomData>(`/api/rooms/${id}/messages`);

  /*
   * Only the messages that arrived after the fetch are held locally — sent
   * from here, or delivered over the socket. The fetched history stays owned
   * by the query and the two are merged at render time, so nothing has to be
   * copied from `data` into state by an effect.
   */
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const history = data?.messages ?? [];
    const seen = new Set(history.map((message) => message._id));
    // The socket can echo a message the fetch already returned.
    return [...history, ...liveMessages.filter((message) => !seen.has(message._id))];
  }, [data, liveMessages]);

  const addLive = (message: Message) =>
    setLiveMessages((prev) => (prev.some((m) => m._id === message._id) ? prev : [...prev, message]));

  useRealtime<Message>(data ? roomChannel(id) : null, 'new-message', addLive);

  const messageCount = messages.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setSendError(null);
    try {
      // Appended from the response, so the sender sees their own message even
      // when realtime delivery is not configured.
      addLive(await api.post<Message>(`/api/rooms/${id}/messages`, { content }));
      setInput('');
    } catch (caught) {
      setSendError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className={cn(chat.shell, chat.shellSingle)}>
        <section className={chat.thread}>
          <div className={chat.placeholder}>
            <strong>This room is closed</strong>
            <p>{error}</p>
            <Link href="/rooms">Back to study rooms</Link>
          </div>
        </section>
      </div>
    );
  }

  if (loading || !data) return <div className="skeleton" style={{ height: 420 }} />;

  const { room } = data;

  return (
    <div className={cn(chat.shell, chat.shellSingle)}>
      <section className={chat.thread}>
        <header className={chat.threadHead}>
          <Link href="/rooms" className={chat.back} style={{ display: 'inline-flex' }} aria-label="Back to study rooms">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className={chat.threadTitle}>{room.title}</div>
            <div className={chat.threadSub}>
              {room.topic} · closes {formatDayLabel(room.expiresAt).toLowerCase()} at {formatTime(room.expiresAt)}
            </div>
          </div>
          <div className={chat.threadHeadPush}>
            {room.isGlobal && (
              <Chip tone="blue" icon={<Globe2 size={12} />} title="Visible to every campus">
                All campuses
              </Chip>
            )}
          </div>
        </header>

        <div className={chat.stream} aria-live="polite">
          {messages.length === 0 ? (
            <div className={chat.placeholder}>
              <strong>Quiet so far</strong>
              <p>Say what you are working on — someone else is probably stuck on the same thing.</p>
            </div>
          ) : (
            messages.map((message) => {
              const mine = message.author._id === me?.id;
              return (
                <div key={message._id} className={cn(chat.msg, mine && chat.msgMine)}>
                  {!mine && (
                    <span className={cn(chat.msgAuthor, 'row gap-2')}>
                      <Avatar name={message.author.name} image={message.author.image} seed={message.author._id} size={18} />
                      {message.author.name}
                    </span>
                  )}
                  <div className={chat.bubble} title={timeAgo(message.createdAt)}>
                    {message.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form className={chat.composer} onSubmit={handleSubmit}>
          <textarea
            className={chat.composerInput}
            rows={1}
            value={input}
            maxLength={2000}
            placeholder={sendError ?? 'Message the room'}
            aria-label="Message the room"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button type="submit" disabled={!input.trim()} loading={sending} icon={<Send size={16} />}>
            Send
          </Button>
        </form>
      </section>
    </div>
  );
}
