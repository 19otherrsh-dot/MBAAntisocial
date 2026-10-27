'use client';

import { useState, useEffect, useMemo, useRef, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Display';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { pusherClient } from '@/lib/pusherClient';
import { useMe } from '@/lib/client/me';
import { timeAgo } from '@/lib/utils';
import styles from '../../app.module.css';

interface Room {
  _id: string;
  title: string;
  topic: string;
  isGlobal: boolean;
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
  const { data, loading, error } = useApiQuery<RoomData>(`/api/rooms/${id}`);
  
  /*
   * Only the messages that arrived over the socket are held locally. The
   * fetched history stays owned by the query and the two are merged at render
   * time, so nothing has to be copied from `data` into state by an effect —
   * which would cost an extra render pass and go stale on every refetch.
   */
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const history = data?.messages ?? [];
    const seen = new Set(history.map((message) => message._id));
    // The socket can echo a message the fetch already returned.
    return [...history, ...liveMessages.filter((message) => !seen.has(message._id))];
  }, [data, liveMessages]);

  const { run: sendMessage, pending: isSending } = useAction(async (content: string) => {
    await api.post<Message>(`/api/rooms/${id}/messages`, { content });
    setInput('');
  });

  // Subscribe to real-time events
  useEffect(() => {
    const channelName = `room-${id}`;
    const channel = pusherClient.subscribe(channelName);

    channel.bind('new-message', (newMessage: Message) => {
      setLiveMessages((prev) =>
        prev.some((m) => m._id === newMessage._id) ? prev : [...prev, newMessage]
      );
    });

    return () => {
      channel.unbind_all();
      pusherClient.unsubscribe(channelName);
    };
  }, [id]);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;
    await sendMessage(input.trim());
  };

  if (error) {
    return (
      <div className={styles.pageHead}>
        <div className={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className={styles.pageHead}>
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  const { room } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className={styles.pageHead} style={{ paddingBottom: 'var(--s-3)' }}>
        <div>
          <Link href="/rooms" className="row gap-2 dim" style={{ marginBottom: 'var(--s-2)', fontSize: 'var(--t-sm)' }}>
            <ArrowLeft size={16} /> Back to Rooms
          </Link>
          <h2 className={styles.pageTitle}>{room.title}</h2>
          <p className={styles.pageSubtitle}>
            {room.topic} · {room.isGlobal ? 'Global' : 'Campus'}
          </p>
        </div>
      </div>

      {/* Chat History */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4)', background: 'var(--surface)', borderRadius: 'var(--r-md) var(--r-md) 0 0', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {messages.length === 0 ? (
          <div className="dim" style={{ textAlign: 'center', marginTop: 'var(--s-6)' }}>
            No messages yet. Be the first to say hi!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.author._id === me?.id;
            return (
              <div key={msg._id} style={{ display: 'flex', gap: 'var(--s-3)', alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                {!isMe && (
                  <Avatar name={msg.author.name} image={msg.author.image} seed={msg.author._id} size={32} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  {!isMe && <span className="dim" style={{ fontSize: 'var(--t-xs)', marginBottom: 2 }}>{msg.author.name}</span>}
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--r-md)',
                    background: isMe ? 'var(--accent)' : 'var(--bg)',
                    color: isMe ? 'var(--on-accent)' : 'var(--text)',
                    border: isMe ? 'none' : '1px solid var(--line)',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {msg.content}
                  </div>
                  <span className="dim" style={{ fontSize: '10px', marginTop: 4 }}>
                    {timeAgo(msg.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--s-2)', padding: 'var(--s-3)', background: 'var(--surface-raised)', borderTop: '1px solid var(--line)', borderRadius: '0 0 var(--r-md) var(--r-md)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          className="input"
          style={{ flex: 1, border: 'none', background: 'var(--bg)' }}
          maxLength={2000}
        />
        <Button type="submit" variant="primary" disabled={!input.trim() || isSending} icon={<Send size={16} />}>
          Send
        </Button>
      </form>
    </div>
  );
}
