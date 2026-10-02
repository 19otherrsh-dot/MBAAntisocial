'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Play, SquareSquare } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Display';
import { Select } from '@/components/ui/Field';
import { useMe } from '@/lib/client/me';
import { ROLE_TRACKS, ROLE_TRACK_META, type RoleTrack } from '@/lib/constants';
import styles from '../app.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIInterviewPage() {
  const { me } = useMe();
  const [track, setTrack] = useState<RoleTrack>('consulting');
  const [started, setStarted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, track: ROLE_TRACK_META[track].label }),
      });

      if (!response.ok) throw new Error('API error');
      if (!response.body) throw new Error('No body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let assistantMessage = '';
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        // The vercel AI SDK returns chunks like 0:"chunk text"\n
        // We will parse it simply.
        const lines = chunk.split('\\n');
        for (const line of lines) {
          if (line.startsWith('0:')) {
             try {
                const text = JSON.parse(line.substring(2));
                assistantMessage += text;
                setMessages((prev) => {
                   const updated = [...prev];
                   updated[updated.length - 1].content = assistantMessage;
                   return updated;
                });
             } catch {
               // A chunk can split mid-token, so a parse failure here is the
               // expected case rather than an error — the next chunk completes it.
             }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const stop = () => {
    // Basic stop: just set isLoading false. We can't cancel fetch unless we use AbortController.
    setIsLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className={styles.pageHead} style={{ paddingBottom: 'var(--s-3)' }}>
        <div>
          <h2 className={styles.pageTitle}>AI Mock Interviewer</h2>
          <p className={styles.pageSubtitle}>
            Practice your cases and behavioral stories with a brutally honest AI alum.
          </p>
        </div>
        {!started && (
          <Button onClick={() => setStarted(true)} icon={<Play size={16} />}>
            Start Interview
          </Button>
        )}
        {started && (
          <Button variant="soft" onClick={stop} icon={<SquareSquare size={16} />} disabled={!isLoading}>
            Stop Generating
          </Button>
        )}
      </div>

      {!started ? (
        <div className="surface-card" style={{ maxWidth: 600, margin: '0 auto', marginTop: 'var(--s-6)' }}>
          <h3 className="h4" style={{ marginBottom: 'var(--s-3)' }}>Interview Setup</h3>
          <p className="dim" style={{ marginBottom: 'var(--s-4)' }}>
            The Antisocial AI Interviewer is tough. It won&rsquo;t give you the answers, it will
            pressure-test your logic, and it expects you to lead the conversation once it gives you
            a prompt.
          </p>
          <div style={{ marginBottom: 'var(--s-4)' }}>
            <Select
              label="Select your target track"
              value={track}
              onChange={(e) => setTrack(e.target.value as RoleTrack)}
              options={ROLE_TRACKS.map((t) => ({ value: t, label: ROLE_TRACK_META[t].label }))}
            />
          </div>
          <Button variant="primary" onClick={() => setStarted(true)} style={{ width: '100%' }}>
            I&rsquo;m ready. Let&rsquo;s go.
          </Button>
        </div>
      ) : (
        <>
          {/* Chat History */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4)', background: 'var(--surface)', borderRadius: 'var(--r-md) var(--r-md) 0 0', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            {messages.length === 0 ? (
              <div className="dim" style={{ textAlign: 'center', marginTop: 'var(--s-6)' }}>
                Waiting for you to begin. Say hi and state your readiness for the {ROLE_TRACK_META[track].label} interview.
              </div>
            ) : (
              messages.map((msg, i) => {
                const isMe = msg.role === 'user';
                return (
                  <div key={i} style={{ display: 'flex', gap: 'var(--s-3)', alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                    {!isMe && (
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
                        <Bot size={18} />
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      {!isMe && <span className="dim" style={{ fontSize: 'var(--t-xs)', marginBottom: 2 }}>Alumni AI</span>}
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: 'var(--r-md)',
                        background: isMe ? 'var(--accent)' : 'var(--bg)',
                        color: isMe ? 'var(--on-accent)' : 'var(--text)',
                        border: isMe ? 'none' : '1px solid var(--line)',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                      }}>
                        {msg.content}
                      </div>
                    </div>
                    {isMe && (
                      <Avatar name={me?.name || 'User'} image={me?.image} seed={me?.id} size={32} />
                    )}
                  </div>
                );
              })
            )}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div style={{ display: 'flex', gap: 'var(--s-3)', alignSelf: 'flex-start' }}>
                 <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
                   <Bot size={18} />
                 </div>
                 <div style={{ padding: '12px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg)', border: '1px solid var(--line)' }}>
                   <span className="dim">Typing...</span>
                 </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--s-2)', padding: 'var(--s-3)', background: 'var(--surface-raised)', borderTop: '1px solid var(--line)', borderRadius: '0 0 var(--r-md) var(--r-md)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Your response..."
              className="input"
              style={{ flex: 1, border: 'none', background: 'var(--bg)' }}
              disabled={isLoading}
              autoFocus
            />
            <Button type="submit" variant="primary" disabled={!input.trim() || isLoading} icon={<Send size={16} />}>
              Respond
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
