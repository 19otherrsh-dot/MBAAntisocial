'use client';

import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { useMe } from '@/lib/client/me';
import { pusherClient } from '@/lib/pusherClient';
import { Avatar } from '@/components/ui/Display';
import { Input } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import styles from '../app.module.css';

interface Peer {
  user: { _id: string; name: string; image?: string };
  lastMessage: string;
  time: string;
  unread: boolean;
}

interface Message {
  _id: string;
  sender: string | { _id: string; name: string; image?: string };
  receiver: string;
  content: string;
  createdAt: string;
}

export default function MessagesPage() {
  const { me } = useMe();
  const [peers, setPeers] = useState<Peer[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loadingPeers, setLoadingPeers] = useState(true);
  /*
   * Which conversation the loaded messages belong to. Deriving `loadingMessages`
   * from this rather than flipping a flag at the top of the effect avoids a
   * synchronous setState inside an effect body — which costs an extra render
   * pass before paint and, when the selection changes twice quickly, can leave
   * the spinner showing for a conversation that already arrived.
   */
  const [loadedPeerId, setLoadedPeerId] = useState<string | null>(null);
  const loadingMessages = selectedPeerId !== null && loadedPeerId !== selectedPeerId;


  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/messages')
      .then(res => res.json())
      .then(data => {
        setPeers(Array.isArray(data) ? data : []);
        setLoadingPeers(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedPeerId) return;

    let active = true;
    fetch(`/api/messages?peerId=${selectedPeerId}`)
      .then(res => res.json())
      .then(data => {
        // Drop the response if the user has already moved to another thread.
        if (!active) return;
        setMessages(Array.isArray(data) ? data : []);
        setLoadedPeerId(selectedPeerId);
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      });

    return () => {
      active = false;
    };
  }, [selectedPeerId]);

  useEffect(() => {
    if (!me) return;
    const channel = pusherClient.subscribe(`user-${me.id}`);
    channel.bind('new-message', (data: Message) => {
      // If the message is from the currently selected peer, append it
      const senderId = typeof data.sender === 'string' ? data.sender : data.sender._id;
      if (selectedPeerId === senderId) {
        setMessages(prev => [...prev, data]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        // Otherwise, just refresh peers list to show new unread
        fetch('/api/messages')
          .then(res => res.json())
          .then(data => setPeers(Array.isArray(data) ? data : []));
      }
    });

    return () => {
      pusherClient.unsubscribe(`user-${me.id}`);
    };
  }, [me, selectedPeerId]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedPeerId) return;
    
    const content = input.trim();
    setInput('');
    
    // Optimistic UI
    const tempId = Date.now().toString();
    setMessages(prev => [...prev, {
      _id: tempId,
      sender: me!.id,
      receiver: selectedPeerId,
      content,
      createdAt: new Date().toISOString()
    }]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverId: selectedPeerId, content })
    });
  };

  const activePeer = peers.find(p => p.user._id === selectedPeerId);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: '16px', marginTop: '16px' }}>
      {/* Sidebar */}
      <div style={{ width: '300px', borderRight: '1px solid var(--border-subtle)', paddingRight: '16px', display: 'flex', flexDirection: 'column' }}>
        <h2 className={styles.pageTitle} style={{ marginBottom: '16px' }}>Messages</h2>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {loadingPeers ? (
            <div className="skeleton" style={{ height: 60 }} />
          ) : peers.length === 0 ? (
            <p className="muted">No conversations yet.</p>
          ) : (
            peers.map(peer => (
              <button
                key={peer.user._id}
                onClick={() => setSelectedPeerId(peer.user._id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: selectedPeerId === peer.user._id ? 'var(--bg-elevated)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <Avatar name={peer.user.name} image={peer.user.image} seed={peer.user._id} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: selectedPeerId === peer.user._id ? 600 : 500, color: 'var(--text-primary)' }}>
                    {peer.user.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: peer.unread ? 'var(--accent-text)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {peer.lastMessage}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
        {selectedPeerId ? (
          <>
            {/* Chat Header */}
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px' }}>
               <Avatar name={activePeer?.user.name || 'User'} image={activePeer?.user.image} seed={activePeer?.user._id} size={32} />
               <span style={{ fontWeight: 600 }}>{activePeer?.user.name}</span>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loadingMessages ? (
                <div className="skeleton" style={{ height: 100 }} />
              ) : (
                messages.map(msg => {
                  const senderId = typeof msg.sender === 'string' ? msg.sender : msg.sender._id;
                  const isMe = senderId === me?.id;
                  return (
                    <div key={msg._id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        background: isMe ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                        color: isMe ? 'white' : 'var(--text-primary)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        maxWidth: '70%',
                        fontSize: '0.9375rem'
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
              </div>
              <Button onClick={sendMessage} icon={<Send size={16} />} disabled={!input.trim()}>
                Send
              </Button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Select a conversation to start messaging
          </div>
        )}
      </div>
    </div>
  );
}
