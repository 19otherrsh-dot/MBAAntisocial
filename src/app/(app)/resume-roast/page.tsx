'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, SquareSquare, UploadCloud, FileText } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Display';
import { useMe } from '@/lib/client/me';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import styles from '../app.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIResumeRoasterPage() {
  const { me } = useMe();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStartRoast = async () => {
    if (!file || isLoading) return;

    setUploading(true);
    let uploadedUrl = '';
    
    // Upload PDF to Cloudinary
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const data = await response.json();
      uploadedUrl = data.url;
    } catch (e) {
      setUploading(false);
      console.error(e);
      setMessages([{ role: 'assistant', content: 'Could not upload that file. Try again.' }]);
      return;
    }
    
    setUploading(false);
    setIsLoading(true);
    setMessages([{ role: 'user', content: `(Uploaded Resume: ${file.name})` }]);

    // Trigger AI Roast API
    try {
      const response = await fetch('/api/ai/roast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl: uploadedUrl }),
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
      setMessages((prev) => [...prev, { role: 'assistant', content: 'The roasting bot crashed (probably out of disgust). Try again.' }]);
    } finally {
      setIsLoading(false);
      setFile(null); // Clear file so they can upload another
    }
  };

  const hasStarted = messages.length > 0 || uploading || isLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className={styles.pageHead} style={{ paddingBottom: 'var(--s-3)' }}>
        <div>
          <h2 className={styles.pageTitle}>AI Resume Roaster</h2>
          <p className={styles.pageSubtitle}>
            Submit your resume. Get roasted by an elite recruiter. Fix your fluff.
          </p>
        </div>
        {isLoading && (
          <Button variant="soft" onClick={() => setIsLoading(false)} icon={<SquareSquare size={16} />} disabled={!isLoading}>
            Stop Roasting
          </Button>
        )}
      </div>

      {!hasStarted ? (
        <div className="surface-card" style={{ maxWidth: 600, margin: '0 auto', marginTop: 'var(--s-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--s-4)', color: 'var(--accent)' }}>
             <FileText size={48} strokeWidth={1} />
          </div>
          <h3 className="h4" style={{ marginBottom: 'var(--s-3)', textAlign: 'center' }}>Upload Your Resume</h3>
          <p className="dim" style={{ marginBottom: 'var(--s-6)', textAlign: 'center' }}>
            Upload your PDF. The Antisocial MBA bot will tear apart every meaningless buzzword and force you to quantify your impact.
          </p>
          
          <div className="stack gap-2" style={{ marginBottom: 'var(--s-6)' }}>
            <input
              id="resume-file"
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{
                padding: 'var(--s-6)',
                border: '2px dashed var(--line-strong)',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-sunken)',
                color: 'var(--text)',
                fontSize: 'var(--t-sm)',
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <span className="dim" style={{ fontSize: 'var(--t-xs)', textAlign: 'center' }}>
              PDF only, max {Math.round(MAX_FILE_SIZE_BYTES / 1_048_576)} MB
            </span>
          </div>

          <Button 
            variant="primary" 
            onClick={handleStartRoast} 
            disabled={!file} 
            loading={uploading || isLoading}
            style={{ width: '100%' }}
            icon={<UploadCloud size={16} />}
          >
            Roast Me
          </Button>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--s-4)', background: 'var(--surface)', borderRadius: 'var(--r-md) var(--r-md) 0 0', display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            {uploading && (
              <div className="dim" style={{ textAlign: 'center', marginTop: 'var(--s-6)' }}>
                Uploading PDF... 
              </div>
            )}
            
            {messages.map((msg, i) => {
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
            })}
            
            {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
              <div style={{ display: 'flex', gap: 'var(--s-3)', alignSelf: 'flex-start' }}>
                 <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)' }}>
                   <Bot size={18} />
                 </div>
                 <div style={{ padding: '12px 16px', borderRadius: 'var(--r-md)', background: 'var(--bg)', border: '1px solid var(--line)' }}>
                   <span className="dim">Reading your resume... and cringing...</span>
                 </div>
              </div>
            )}
            
            {!isLoading && messages.length > 1 && (
              <div style={{ marginTop: 'var(--s-6)', textAlign: 'center' }}>
                <Button variant="secondary" onClick={() => setMessages([])}>
                  Submit another Resume
                </Button>
              </div>
            )}
            
            <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
